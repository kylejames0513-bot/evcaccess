Attribute VB_Name = "HubNewHireSync"
Option Explicit

' -----------------------------------------------------------------------------
' Monthly New Hire Tracker -> Training Hub sync
' -----------------------------------------------------------------------------
' Import this module into Monthly New Hire Tracker.xlsm.
'
' Required setup:
'   1) Set HUB_BASE_URL to your deployed app URL (no trailing slash)
'   2) Set HUB_SYNC_TOKEN to the same value as server env HUB_SYNC_TOKEN
' -----------------------------------------------------------------------------

Private Const HUB_BASE_URL As String = "https://evcaccess.vercel.app"
Private Const HUB_SYNC_TOKEN As String = "REPLACE_WITH_SYNC_TOKEN"

Private Const API_SYNC_NEW_HIRES As String = "/api/sync/new-hires"
Private Const LOG_SHEET_NAME As String = "NH Hub Log"

Private Const NEW_HIRE_HEADER_ROW As Long = 4
Private Const TRANSFER_HEADER_ROW As Long = 58
Private Const NEW_HIRE_START_ROW As Long = 5
Private Const NEW_HIRE_END_ROW As Long = 54
Private Const TRANSFER_START_ROW As Long = 59
Private Const TRANSFER_END_ROW As Long = 108

Public Sub PushNewHiresToHub()
    Dim payload As String
    payload = BuildWorkbookPayload()

    If payload = vbNullString Then
        MsgBox "No new-hire or transfer rows were found to sync.", vbInformation
        Exit Sub
    End If

    PostPayloadToHub payload
End Sub

Private Function BuildWorkbookPayload() As String
    Dim ws As Worksheet
    Dim items As String
    Dim itemCount As Long

    items = vbNullString
    itemCount = 0

    For Each ws In ThisWorkbook.Worksheets
        If ShouldSyncMonthSheet(ws.Name) Then
            AppendSheetRows ws, NEW_HIRE_HEADER_ROW, NEW_HIRE_START_ROW, NEW_HIRE_END_ROW, items, itemCount
            AppendSheetRows ws, TRANSFER_HEADER_ROW, TRANSFER_START_ROW, TRANSFER_END_ROW, items, itemCount
        End If
    Next ws

    If itemCount = 0 Then
        BuildWorkbookPayload = vbNullString
    Else
        BuildWorkbookPayload = "{""new_hires"":[" & items & "]}"
    End If
End Function

Private Sub AppendSheetRows( _
    ByVal ws As Worksheet, _
    ByVal headerRow As Long, _
    ByVal firstRow As Long, _
    ByVal lastRow As Long, _
    ByRef items As String, _
    ByRef itemCount As Long _
)
    Dim colLast As Long
    Dim colFirst As Long
    Dim colHireDate As Long
    Dim colDivision As Long
    Dim colDepartment As Long
    Dim colPosition As Long
    Dim colJobTitle As Long
    Dim colPaylocity As Long

    colLast = ResolveHeaderColumn(ws, headerRow, Array("last name", "last_name", "lastname"), 3)
    colFirst = ResolveHeaderColumn(ws, headerRow, Array("first name", "first_name", "firstname"), 4)
    colHireDate = ResolveHeaderColumn(ws, headerRow, Array("hire date", "date of hire", "hire_date"), 5)
    colDivision = ResolveHeaderColumn(ws, headerRow, Array("division"), 6)
    colDepartment = ResolveHeaderColumn(ws, headerRow, Array("department"), 7)
    colPosition = ResolveHeaderColumn(ws, headerRow, Array("position"), 8)
    colJobTitle = ResolveHeaderColumn(ws, headerRow, Array("job title", "job_title", "title"), 8)
    colPaylocity = ResolveHeaderColumn(ws, headerRow, Array("paylocity id", "employee number", "employee #"), 9)

    Dim r As Long
    For r = firstRow To lastRow
        Dim lastName As String
        Dim firstName As String
        Dim hireDateIso As String
        Dim divisionValue As String
        Dim departmentValue As String
        Dim positionValue As String
        Dim jobTitleValue As String
        Dim paylocityValue As String

        lastName = CleanCellText(ws.Cells(r, colLast).Value)
        firstName = CleanCellText(ws.Cells(r, colFirst).Value)
        hireDateIso = ToIsoDate(ws.Cells(r, colHireDate).Value)
        divisionValue = CleanCellText(ws.Cells(r, colDivision).Value)
        departmentValue = CleanCellText(ws.Cells(r, colDepartment).Value)
        positionValue = CleanCellText(ws.Cells(r, colPosition).Value)
        jobTitleValue = CleanCellText(ws.Cells(r, colJobTitle).Value)
        paylocityValue = CleanCellText(ws.Cells(r, colPaylocity).Value)

        If lastName <> vbNullString And firstName <> vbNullString And hireDateIso <> vbNullString Then
            Dim rowJson As String
            rowJson = "{"
            rowJson = rowJson & """last_name"":""" & JsonEscape(lastName) & ""","
            rowJson = rowJson & """first_name"":""" & JsonEscape(firstName) & ""","
            rowJson = rowJson & """hire_date"":""" & hireDateIso & ""","
            rowJson = rowJson & """division"":" & JsonNullableString(divisionValue) & ","
            rowJson = rowJson & """department"":" & JsonNullableString(departmentValue) & ","
            rowJson = rowJson & """position"":" & JsonNullableString(positionValue) & ","
            rowJson = rowJson & """job_title"":" & JsonNullableString(jobTitleValue) & ","
            rowJson = rowJson & """paylocity_id"":" & JsonNullableString(paylocityValue) & ","
            rowJson = rowJson & """sheet"":""" & JsonEscape(ws.Name) & ""","
            rowJson = rowJson & """row_number"":" & CStr(r)
            rowJson = rowJson & "}"

            If itemCount > 0 Then items = items & ","
            items = items & rowJson
            itemCount = itemCount + 1
        End If
    Next r
End Sub

Private Sub PostPayloadToHub(ByVal payload As String)
    Dim endpoint As String
    endpoint = HUB_BASE_URL & API_SYNC_NEW_HIRES

    Dim http As Object
    Set http = CreateObject("MSXML2.XMLHTTP")

    On Error GoTo HttpFailure
    http.Open "POST", endpoint, False
    http.setRequestHeader "Content-Type", "application/json"
    http.setRequestHeader "x-hub-sync-token", HUB_SYNC_TOKEN
    http.send payload
    On Error GoTo 0

    Dim statusCode As Long
    Dim responseText As String
    statusCode = CLng(http.Status)
    responseText = CStr(http.responseText)

    WriteSyncLog statusCode, responseText

    If statusCode = 200 Then
        MsgBox "New-hire sync completed successfully." & vbCrLf & responseText, vbInformation
    ElseIf statusCode = 202 Then
        MsgBox "Batch queued for approval on /roster-queue." & vbCrLf & responseText, vbInformation
    Else
        MsgBox "New-hire sync failed (HTTP " & CStr(statusCode) & ")." & vbCrLf & responseText, vbCritical
    End If

    Exit Sub

HttpFailure:
    WriteSyncLog -1, "Network error: " & Err.Description
    MsgBox "Unable to reach hub sync endpoint." & vbCrLf & Err.Description, vbCritical
End Sub

Private Sub WriteSyncLog(ByVal statusCode As Long, ByVal resultText As String)
    Dim ws As Worksheet
    Set ws = EnsureLogSheet()

    Dim nextRow As Long
    nextRow = ws.Cells(ws.Rows.Count, 1).End(xlUp).Row + 1
    If nextRow < 2 Then nextRow = 2

    ws.Cells(nextRow, 1).Value = Now
    ws.Cells(nextRow, 2).Value = "new_hires"
    ws.Cells(nextRow, 3).Value = statusCode
    ws.Cells(nextRow, 4).Value = Left$(resultText, 30000)
End Sub

Private Function EnsureLogSheet() As Worksheet
    Dim ws As Worksheet
    For Each ws In ThisWorkbook.Worksheets
        If StrComp(ws.Name, LOG_SHEET_NAME, vbTextCompare) = 0 Then
            Set EnsureLogSheet = ws
            Exit Function
        End If
    Next ws

    Set ws = ThisWorkbook.Worksheets.Add(After:=ThisWorkbook.Worksheets(ThisWorkbook.Worksheets.Count))
    ws.Name = LOG_SHEET_NAME
    ws.Cells(1, 1).Value = "timestamp"
    ws.Cells(1, 2).Value = "endpoint"
    ws.Cells(1, 3).Value = "status_code"
    ws.Cells(1, 4).Value = "response_excerpt"
    ws.Rows(1).Font.Bold = True

    Set EnsureLogSheet = ws
End Function

Private Function ShouldSyncMonthSheet(ByVal sheetName As String) As Boolean
    Dim nameLower As String
    nameLower = LCase$(Trim$(sheetName))

    If nameLower = LCase$(LOG_SHEET_NAME) Then
        ShouldSyncMonthSheet = False
        Exit Function
    End If
    If InStr(nameLower, "sync log") > 0 Then
        ShouldSyncMonthSheet = False
        Exit Function
    End If
    If InStr(nameLower, "headcount") > 0 Then
        ShouldSyncMonthSheet = False
        Exit Function
    End If
    If nameLower = "dashboard" Or nameLower = "instructions" Or nameLower = "readme" Then
        ShouldSyncMonthSheet = False
        Exit Function
    End If

    ShouldSyncMonthSheet = True
End Function

Private Function ResolveHeaderColumn(ByVal ws As Worksheet, ByVal headerRow As Long, ByVal aliases As Variant, ByVal fallbackColumn As Long) As Long
    Dim lastCol As Long
    lastCol = ws.Cells(headerRow, ws.Columns.Count).End(xlToLeft).Column
    If lastCol < 1 Then
        ResolveHeaderColumn = fallbackColumn
        Exit Function
    End If

    Dim c As Long
    Dim headerText As String
    For c = 1 To lastCol
        headerText = LCase$(Trim$(CStr(ws.Cells(headerRow, c).Value)))
        If headerText <> vbNullString Then
            Dim i As Long
            For i = LBound(aliases) To UBound(aliases)
                If headerText = LCase$(CStr(aliases(i))) Then
                    ResolveHeaderColumn = c
                    Exit Function
                End If
            Next i
        End If
    Next c

    ResolveHeaderColumn = fallbackColumn
End Function

Private Function CleanCellText(ByVal valueIn As Variant) As String
    If IsError(valueIn) Or IsNull(valueIn) Or IsEmpty(valueIn) Then
        CleanCellText = vbNullString
    Else
        CleanCellText = Trim$(CStr(valueIn))
    End If
End Function

Private Function ToIsoDate(ByVal valueIn As Variant) As String
    If IsDate(valueIn) Then
        ToIsoDate = Format$(CDate(valueIn), "yyyy-mm-dd")
    Else
        Dim textValue As String
        textValue = Trim$(CStr(valueIn))
        If textValue = vbNullString Then
            ToIsoDate = vbNullString
        ElseIf IsDate(textValue) Then
            ToIsoDate = Format$(CDate(textValue), "yyyy-mm-dd")
        Else
            ToIsoDate = vbNullString
        End If
    End If
End Function

Private Function JsonNullableString(ByVal valueIn As String) As String
    If valueIn = vbNullString Then
        JsonNullableString = "null"
    Else
        JsonNullableString = """" & JsonEscape(valueIn) & """"
    End If
End Function

Private Function JsonEscape(ByVal rawText As String) As String
    Dim s As String
    s = rawText
    s = Replace(s, "\", "\\")
    s = Replace(s, """", "\""")
    s = Replace(s, vbCrLf, "\n")
    s = Replace(s, vbCr, "\n")
    s = Replace(s, vbLf, "\n")
    JsonEscape = s
End Function

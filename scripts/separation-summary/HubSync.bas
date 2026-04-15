Attribute VB_Name = "HubSync"
Option Explicit

' -----------------------------------------------------------------------------
' FY Separation Summary -> Training Hub sync
' -----------------------------------------------------------------------------
' Import this module into FY Separation Summary workbook.
'
' Required setup:
'   1) Set HUB_BASE_URL to your deployed app URL (no trailing slash)
'   2) Set HUB_SYNC_TOKEN to the same value as server env HUB_SYNC_TOKEN
' -----------------------------------------------------------------------------

Private Const HUB_BASE_URL As String = "https://evcaccess.vercel.app"
Private Const HUB_SYNC_TOKEN As String = "uMY1tgIYL1GObgknFYmzaC2vVt7KiNKn3Q9C9-qlm-8"

Private Const API_SYNC_SEPARATIONS As String = "/api/sync/separations"
Private Const API_SYNC_SEPARATION_AUDIT As String = "/api/sync/separation-audit?limit=200"

Private Const SEPARATION_NAME_COLUMN As Long = 1      ' A
Private Const SEPARATION_DATE_COLUMN As Long = 2      ' B
Private Const DATA_START_ROW As Long = 9
Private Const DATA_END_ROW As Long = 413

Private Const LOG_SHEET_NAME As String = "Sync Log"
Private Const AUDIT_SHEET_NAME As String = "Hub Audit Pull"

Public Sub PushSeparationsToHub()
    Dim payload As String
    Dim fySheetCount As Long
    Dim separationCount As Long
    payload = BuildWorkbookPayload(fySheetCount, separationCount)

    If payload = vbNullString Then
        MsgBox "No separation rows were found across FY sheets.", vbInformation
        Exit Sub
    End If

    PostPayloadToHub payload, "all_fy_sheets", separationCount, fySheetCount
End Sub

Public Sub PushActiveFiscalSheetToHub()
    Dim sourceSheet As Worksheet
    Set sourceSheet = ResolveFiscalSheet()

    If sourceSheet Is Nothing Then
        MsgBox "Could not find an FY data sheet to sync.", vbExclamation
        Exit Sub
    End If

    Dim payload As String
    Dim separationCount As Long
    payload = BuildSeparationPayload(sourceSheet, separationCount)
    If payload = vbNullString Then
        MsgBox "No separation rows were found on " & sourceSheet.Name & ".", vbInformation
        Exit Sub
    End If

    PostPayloadToHub payload, sourceSheet.Name, separationCount, 1
End Sub

Public Sub PullSeparationAuditFromHub()
    Dim endpoint As String
    endpoint = HUB_BASE_URL & API_SYNC_SEPARATION_AUDIT

    Dim http As Object
    Set http = CreateObject("MSXML2.XMLHTTP")

    On Error GoTo HttpFailure
    http.Open "GET", endpoint, False
    http.setRequestHeader "x-hub-sync-token", HUB_SYNC_TOKEN
    http.send
    On Error GoTo 0

    Dim statusCode As Long
    Dim responseText As String
    statusCode = CLng(http.Status)
    responseText = CStr(http.responseText)

    WriteSyncLog "separation_audit_pull", statusCode, responseText

    Dim auditSheet As Worksheet
    Set auditSheet = EnsureSheet(AUDIT_SHEET_NAME)
    auditSheet.Cells.Clear
    auditSheet.Cells(1, 1).Value = "pulled_at"
    auditSheet.Cells(1, 2).Value = "http_status"
    auditSheet.Cells(1, 3).Value = "response_json"
    auditSheet.Cells(2, 1).Value = Now
    auditSheet.Cells(2, 2).Value = statusCode
    auditSheet.Cells(2, 3).Value = responseText
    auditSheet.Columns("A:C").EntireColumn.AutoFit

    If statusCode = 200 Then
        MsgBox "Separation audit pull complete.", vbInformation
    Else
        MsgBox "Separation audit pull failed (HTTP " & CStr(statusCode) & ").", vbExclamation
    End If

    Exit Sub

HttpFailure:
    WriteSyncLog "separation_audit_pull", -1, "Network error: " & Err.Description
    MsgBox "Unable to pull separation audit from hub." & vbCrLf & Err.Description, vbCritical
End Sub

Private Function BuildWorkbookPayload(ByRef fySheetCount As Long, ByRef separationCount As Long) As String
    Dim items As String
    Dim itemCount As Long
    items = vbNullString
    itemCount = 0
    fySheetCount = 0
    separationCount = 0

    Dim ws As Worksheet
    For Each ws In ThisWorkbook.Worksheets
        If ShouldUseAsFiscalSheet(ws.Name) Then
            fySheetCount = fySheetCount + 1
            AppendSheetRows ws, items, itemCount, separationCount
        End If
    Next ws

    If itemCount = 0 Then
        BuildWorkbookPayload = vbNullString
    Else
        BuildWorkbookPayload = "{""separations"":[" & items & "]}"
    End If
End Function

Private Function BuildSeparationPayload(ByVal ws As Worksheet, ByRef separationCount As Long) As String
    Dim items As String
    Dim itemCount As Long
    items = vbNullString
    itemCount = 0
    separationCount = 0

    AppendSheetRows ws, items, itemCount, separationCount

    If itemCount = 0 Then
        BuildSeparationPayload = vbNullString
    Else
        BuildSeparationPayload = "{""separations"":[" & items & "]}"
    End If
End Function

Private Sub AppendSheetRows( _
    ByVal ws As Worksheet, _
    ByRef items As String, _
    ByRef itemCount As Long, _
    ByRef separationCount As Long _
)
    Dim r As Long
    For r = DATA_START_ROW To DATA_END_ROW
        Dim fullName As String
        Dim sepDateIso As String

        fullName = CleanCellText(ws.Cells(r, SEPARATION_NAME_COLUMN).Value)
        sepDateIso = ToIsoDate(ws.Cells(r, SEPARATION_DATE_COLUMN).Value)

        If fullName <> vbNullString And sepDateIso <> vbNullString Then
            Dim firstName As String
            Dim lastName As String
            SplitName fullName, firstName, lastName

            If lastName <> vbNullString Then
                Dim rowJson As String
                rowJson = "{"
                rowJson = rowJson & """last_name"":""" & JsonEscape(lastName) & ""","
                rowJson = rowJson & """first_name"":" & JsonNullableString(firstName) & ","
                rowJson = rowJson & """date_of_separation"":""" & sepDateIso & ""","
                rowJson = rowJson & """sheet"":""" & JsonEscape(ws.Name) & ""","
                rowJson = rowJson & """row_number"":" & CStr(r)
                rowJson = rowJson & "}"

                If itemCount > 0 Then items = items & ","
                items = items & rowJson
                itemCount = itemCount + 1
                separationCount = separationCount + 1
            End If
        End If
    Next r
End Sub

Private Sub PostPayloadToHub( _
    ByVal payload As String, _
    ByVal sourceSheetName As String, _
    ByVal separationCount As Long, _
    ByVal fySheetCount As Long _
)
    Dim endpoint As String
    endpoint = HUB_BASE_URL & API_SYNC_SEPARATIONS

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

    WriteSyncLog "separations:" & sourceSheetName, statusCode, responseText

    Dim scopedLabel As String
    scopedLabel = CStr(separationCount) & " row(s)"
    If fySheetCount > 1 Then
        scopedLabel = scopedLabel & " across " & CStr(fySheetCount) & " FY sheets"
    End If

    If statusCode = 200 Then
        MsgBox "Separation sync completed successfully for " & scopedLabel & "." & vbCrLf & responseText, vbInformation
    ElseIf statusCode = 202 Then
        MsgBox "Separation batch queued for approval on /roster-queue (" & scopedLabel & ")." & vbCrLf & responseText, vbInformation
    Else
        MsgBox "Separation sync failed (HTTP " & CStr(statusCode) & ") for " & scopedLabel & "." & vbCrLf & responseText, vbCritical
    End If

    Exit Sub

HttpFailure:
    WriteSyncLog "separations:" & sourceSheetName, -1, "Network error: " & Err.Description
    MsgBox "Unable to reach hub separation sync endpoint." & vbCrLf & Err.Description, vbCritical
End Sub

Private Function ResolveFiscalSheet() As Worksheet
    If ShouldUseAsFiscalSheet(ActiveSheet.Name) Then
        Set ResolveFiscalSheet = ActiveSheet
        Exit Function
    End If

    Dim dashboardName As String
    dashboardName = ReadDashboardSheetTarget()
    If dashboardName <> vbNullString Then
        If WorksheetExists(dashboardName) Then
            If ShouldUseAsFiscalSheet(dashboardName) Then
                Set ResolveFiscalSheet = ThisWorkbook.Worksheets(dashboardName)
                Exit Function
            End If
        End If
    End If

    Dim ws As Worksheet
    For Each ws In ThisWorkbook.Worksheets
        If ShouldUseAsFiscalSheet(ws.Name) Then
            Set ResolveFiscalSheet = ws
            Exit Function
        End If
    Next ws
End Function

Private Function ShouldUseAsFiscalSheet(ByVal sheetName As String) As Boolean
    Dim lowered As String
    lowered = LCase$(Trim$(sheetName))
    ShouldUseAsFiscalSheet = (Left$(lowered, 2) = "fy")
End Function

Private Function ReadDashboardSheetTarget() As String
    On Error GoTo SafeExit
    If Not WorksheetExists("Dashboard") Then Exit Function

    Dim raw As String
    raw = CleanCellText(ThisWorkbook.Worksheets("Dashboard").Range("B5").Value)
    If raw <> vbNullString Then
        ReadDashboardSheetTarget = raw
    End If
SafeExit:
End Function

Private Function WorksheetExists(ByVal worksheetName As String) As Boolean
    Dim ws As Worksheet
    For Each ws In ThisWorkbook.Worksheets
        If StrComp(ws.Name, worksheetName, vbTextCompare) = 0 Then
            WorksheetExists = True
            Exit Function
        End If
    Next ws
End Function

Private Sub SplitName(ByVal fullName As String, ByRef firstName As String, ByRef lastName As String)
    firstName = vbNullString
    lastName = vbNullString

    Dim trimmedName As String
    trimmedName = Trim$(fullName)
    If trimmedName = vbNullString Then Exit Sub

    If InStr(trimmedName, ",") > 0 Then
        Dim commaParts() As String
        commaParts = Split(trimmedName, ",")
        lastName = Trim$(commaParts(0))
        If UBound(commaParts) >= 1 Then
            firstName = Trim$(commaParts(1))
        End If
        Exit Sub
    End If

    Dim words() As String
    words = Split(trimmedName, " ")
    Dim tokenCount As Long
    tokenCount = UBound(words) - LBound(words) + 1

    If tokenCount = 1 Then
        lastName = words(LBound(words))
    Else
        firstName = words(LBound(words))
        lastName = words(UBound(words))
    End If
End Sub

Private Sub WriteSyncLog(ByVal endpointName As String, ByVal statusCode As Long, ByVal resultText As String)
    Dim ws As Worksheet
    Set ws = EnsureSheet(LOG_SHEET_NAME)

    If ws.Cells(1, 1).Value = vbNullString Then
        ws.Cells(1, 1).Value = "timestamp"
        ws.Cells(1, 2).Value = "endpoint"
        ws.Cells(1, 3).Value = "status_code"
        ws.Cells(1, 4).Value = "response_excerpt"
        ws.Rows(1).Font.Bold = True
    End If

    Dim nextRow As Long
    nextRow = ws.Cells(ws.Rows.Count, 1).End(xlUp).Row + 1
    If nextRow < 2 Then nextRow = 2

    ws.Cells(nextRow, 1).Value = Now
    ws.Cells(nextRow, 2).Value = endpointName
    ws.Cells(nextRow, 3).Value = statusCode
    ws.Cells(nextRow, 4).Value = Left$(resultText, 30000)
End Sub

Private Function EnsureSheet(ByVal sheetName As String) As Worksheet
    Dim ws As Worksheet
    For Each ws In ThisWorkbook.Worksheets
        If StrComp(ws.Name, sheetName, vbTextCompare) = 0 Then
            Set EnsureSheet = ws
            Exit Function
        End If
    Next ws

    Set ws = ThisWorkbook.Worksheets.Add(After:=ThisWorkbook.Worksheets(ThisWorkbook.Worksheets.Count))
    ws.Name = sheetName
    Set EnsureSheet = ws
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

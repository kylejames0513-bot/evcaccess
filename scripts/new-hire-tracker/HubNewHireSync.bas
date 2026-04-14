Attribute VB_Name = "HubNewHireSync"
Option Explicit

' ============================================================
' Monthly New Hire Tracker -> Hub sync module
' ============================================================
' PURPOSE
'   1) Push new-hire / transfer rows to the hub API so they are
'      created/reactivated in Supabase.
'   2) Pull training status from the hub API to update the monthly
'      tracker columns (CPR/FA, Med Cert, Ukeru, Mealtime).
'
' This keeps Supabase as the source of truth while using the hub
' endpoints as the only write/read automation gateway.
' ============================================================

' --------- REQUIRED CONFIG ---------
Private Const HUB_BASE_URL As String = "https://your-hub-domain.example.com"
Private Const HUB_SYNC_TOKEN As String = "replace-with-your-hub-sync-token"

' --------- Sheet layout ---------
Private Const NH_FIRST_ROW As Long = 5
Private Const NH_LAST_ROW As Long = 54
Private Const TR_FIRST_ROW As Long = 59
Private Const TR_LAST_ROW As Long = 108

' Name and status columns already in your workbook.
Private Const COL_LAST_NAME As Long = 3      ' C
Private Const COL_FIRST_NAME As Long = 4     ' D
Private Const NH_STATUS_COL As Long = 19
Private Const TR_STATUS_COL As Long = 16

' Training output columns (existing tracker layout).
Private Const NH_CPRFA_COL As Long = 12
Private Const NH_MEDCERT_COL As Long = 13
Private Const NH_UKERU_COL As Long = 14
Private Const NH_MEALTIME_COL As Long = 15
Private Const TR_UKERU_COL As Long = 11
Private Const TR_MEALTIME_COL As Long = 12

' Header rows used for dynamic column lookup.
Private Const NH_HEADER_ROW As Long = 4
Private Const TR_HEADER_ROW As Long = 58

' Fallback metadata columns if header lookup fails.
Private Const FALLBACK_ID_COL As Long = 5
Private Const FALLBACK_POSITION_COL As Long = 6
Private Const FALLBACK_HIRE_DATE_COL As Long = 7
Private Const FALLBACK_DIVISION_COL As Long = 8
Private Const FALLBACK_DEPARTMENT_COL As Long = 9

Private Type SectionColumns
    IdCol As Long
    PositionCol As Long
    HireDateCol As Long
    DivisionCol As Long
    DepartmentCol As Long
End Type

Public Sub RunHubSyncCycle()
    Dim answer As VbMsgBoxResult
    answer = MsgBox( _
        "Run full hub sync?" & vbCrLf & vbCrLf & _
        "1) Push New Hires/Transfers to hub" & vbCrLf & _
        "2) Pull training status from hub", _
        vbYesNo + vbQuestion, "Hub Sync")
    If answer <> vbYes Then Exit Sub

    PushNewHiresToHub
    SyncTrainingFromHub
End Sub

Public Sub PushNewHiresToHub()
    Dim payload As String, rowCount As Long, skippedCount As Long
    payload = BuildNewHiresPayload(rowCount, skippedCount)

    If rowCount = 0 Then
        MsgBox "No pushable rows found (Name + Hire Date + active status required)." & vbCrLf & _
               "Skipped rows: " & skippedCount, vbInformation, "Push New Hires"
        Exit Sub
    End If

    Dim responseText As String, statusCode As Long
    Application.StatusBar = "Pushing " & rowCount & " rows to hub..."
    statusCode = HttpJson("POST", HUB_BASE_URL & "/api/sync/new-hires", payload, responseText)
    Application.StatusBar = False

    If statusCode < 200 Or statusCode >= 300 Then
        MsgBox "Push failed: HTTP " & statusCode & vbCrLf & Left(responseText, 700), vbExclamation, "Push New Hires"
        Exit Sub
    End If

    Dim created As Long, updated As Long, reactivated As Long
    Dim unchanged As Long, ambiguous As Long, failed As Long
    ParseNewHireSummary responseText, created, updated, reactivated, unchanged, ambiguous, failed

    MsgBox "Push complete." & vbCrLf & vbCrLf & _
           "Rows sent:      " & rowCount & vbCrLf & _
           "Created:        " & created & vbCrLf & _
           "Updated:        " & updated & vbCrLf & _
           "Reactivated:    " & reactivated & vbCrLf & _
           "Unchanged:      " & unchanged & vbCrLf & _
           "Ambiguous:      " & ambiguous & vbCrLf & _
           "Failed:         " & failed & vbCrLf & _
           "Skipped locally:" & skippedCount, _
           vbInformation, "Push New Hires"
End Sub

Public Sub SyncTrainingFromHub()
    Dim namePayload As String, nameCount As Long
    namePayload = BuildTrainingRequestPayload(nameCount)
    If nameCount = 0 Then
        MsgBox "No active names found to sync.", vbInformation, "Pull Training Status"
        Exit Sub
    End If

    Dim responseText As String, statusCode As Long
    Application.StatusBar = "Pulling training status from hub..."
    statusCode = HttpJson("POST", HUB_BASE_URL & "/api/sync/training-status", namePayload, responseText)
    Application.StatusBar = False

    If statusCode < 200 Or statusCode >= 300 Then
        MsgBox "Pull failed: HTTP " & statusCode & vbCrLf & Left(responseText, 700), vbExclamation, "Pull Training Status"
        Exit Sub
    End If

    Dim people As Object, employeeCount As Long
    Set people = CreateObject("Scripting.Dictionary")
    people.CompareMode = vbTextCompare
    If Not ParseTrainingEmployees(responseText, people, employeeCount) Then
        MsgBox "Could not parse training response." & vbCrLf & Left(responseText, 700), vbExclamation, "Pull Training Status"
        Exit Sub
    End If

    Dim updates As Long
    Application.ScreenUpdating = False
    Application.Calculation = xlCalculationManual
    updates = ApplyTrainingDataToSheets(people)
    Application.Calculation = xlCalculationAutomatic
    Application.ScreenUpdating = True

    MsgBox "Pull complete." & vbCrLf & vbCrLf & _
           "Names requested: " & nameCount & vbCrLf & _
           "Employees returned: " & employeeCount & vbCrLf & _
           "Cells updated: " & updates, _
           vbInformation, "Pull Training Status"
End Sub

Private Function BuildNewHiresPayload(ByRef rowCount As Long, ByRef skippedCount As Long) As String
    Dim chunks As Collection
    Set chunks = New Collection

    Dim months As Variant, m As Long
    months = MonthSheetNames()

    For m = LBound(months) To UBound(months)
        Dim ws As Worksheet
        Set ws = Nothing
        On Error Resume Next
        Set ws = ThisWorkbook.Worksheets(CStr(months(m)))
        On Error GoTo 0
        If ws Is Nothing Then GoTo NextMonth

        Dim nhCols As SectionColumns, trCols As SectionColumns
        ResolveSectionColumns ws, NH_HEADER_ROW, nhCols
        ResolveSectionColumns ws, TR_HEADER_ROW, trCols

        CollectSectionRows ws, NH_FIRST_ROW, NH_LAST_ROW, NH_STATUS_COL, nhCols, chunks, rowCount, skippedCount
        CollectSectionRows ws, TR_FIRST_ROW, TR_LAST_ROW, TR_STATUS_COL, trCols, chunks, rowCount, skippedCount
NextMonth:
    Next m

    BuildNewHiresPayload = "{""new_hires"":[" & JoinCollection(chunks, ",") & "]}"
End Function

Private Sub CollectSectionRows(ByVal ws As Worksheet, ByVal firstRow As Long, ByVal lastRow As Long, _
                               ByVal statusCol As Long, ByRef cols As SectionColumns, _
                               ByRef chunks As Collection, ByRef rowCount As Long, ByRef skippedCount As Long)
    Dim r As Long
    For r = firstRow To lastRow
        Dim ln As String, fn As String
        ln = Trim(CStr(ws.Cells(r, COL_LAST_NAME).Value & ""))
        fn = Trim(CStr(ws.Cells(r, COL_FIRST_NAME).Value & ""))
        If ln = "" Or fn = "" Then GoTo SkipRow
        If IsInactiveStatus(CStr(ws.Cells(r, statusCol).Value & "")) Then GoTo SkipRow

        Dim hireDateYmd As String
        hireDateYmd = ToYmd(ws.Cells(r, cols.HireDateCol).Value)
        If hireDateYmd = "" Then GoTo SkipRow

        Dim paylocityId As String, position As String, division As String, department As String
        paylocityId = Trim(CStr(ws.Cells(r, cols.IdCol).Value & ""))
        position = Trim(CStr(ws.Cells(r, cols.PositionCol).Value & ""))
        division = Trim(CStr(ws.Cells(r, cols.DivisionCol).Value & ""))
        department = Trim(CStr(ws.Cells(r, cols.DepartmentCol).Value & ""))

        Dim obj As String
        obj = "{"
        obj = obj & """last_name"":""" & JsonEscape(ln) & ""","
        obj = obj & """first_name"":""" & JsonEscape(fn) & ""","
        obj = obj & """hire_date"":""" & hireDateYmd & ""","
        obj = obj & """division"":" & JsonStringOrNull(division) & ","
        obj = obj & """department"":" & JsonStringOrNull(department) & ","
        obj = obj & """position"":" & JsonStringOrNull(position) & ","
        obj = obj & """job_title"":" & JsonStringOrNull(position) & ","
        obj = obj & """paylocity_id"":" & JsonStringOrNull(paylocityId) & ","
        obj = obj & """sheet"":""" & JsonEscape(ws.Name) & ""","
        obj = obj & """row_number"":" & CStr(r)
        obj = obj & "}"

        chunks.Add obj
        rowCount = rowCount + 1
        GoTo NextRow
SkipRow:
        skippedCount = skippedCount + 1
NextRow:
    Next r
End Sub

Private Function BuildTrainingRequestPayload(ByRef nameCount As Long) As String
    Dim names As Object
    Set names = CreateObject("Scripting.Dictionary")
    names.CompareMode = vbTextCompare

    Dim months As Variant, m As Long, r As Long
    months = MonthSheetNames()
    For m = LBound(months) To UBound(months)
        Dim ws As Worksheet
        Set ws = Nothing
        On Error Resume Next
        Set ws = ThisWorkbook.Worksheets(CStr(months(m)))
        On Error GoTo 0
        If ws Is Nothing Then GoTo NextMonth

        For r = NH_FIRST_ROW To NH_LAST_ROW
            AddActiveName ws, r, NH_STATUS_COL, names
        Next r
        For r = TR_FIRST_ROW To TR_LAST_ROW
            AddActiveName ws, r, TR_STATUS_COL, names
        Next r
NextMonth:
    Next m

    Dim chunks As Collection
    Set chunks = New Collection
    Dim k As Variant
    For Each k In names.Keys
        chunks.Add CStr(names(k))
    Next k
    nameCount = chunks.Count

    BuildTrainingRequestPayload = "{""names"":[" & JoinCollection(chunks, ",") & "],""trainings"":[""CPR"",""CPR/FA"",""FIRSTAID"",""MED_TRAIN"",""Ukeru"",""Mealtime""]}"
End Function

Private Sub AddActiveName(ByVal ws As Worksheet, ByVal rowNum As Long, ByVal statusCol As Long, ByRef names As Object)
    Dim ln As String, fn As String
    ln = Trim(CStr(ws.Cells(rowNum, COL_LAST_NAME).Value & ""))
    fn = Trim(CStr(ws.Cells(rowNum, COL_FIRST_NAME).Value & ""))
    If ln = "" Then Exit Sub
    If IsInactiveStatus(CStr(ws.Cells(rowNum, statusCol).Value & "")) Then Exit Sub

    Dim key As String
    key = NameKey(ln, fn)
    If Not names.Exists(key) Then
        names.Add key, "{""last_name"":""" & JsonEscape(ln) & """,""first_name"":""" & JsonEscape(fn) & """}"
    End If
End Sub

Private Function ApplyTrainingDataToSheets(ByRef people As Object) As Long
    Dim months As Variant, m As Long, r As Long
    months = MonthSheetNames()

    Dim updates As Long
    For m = LBound(months) To UBound(months)
        Dim ws As Worksheet
        Set ws = Nothing
        On Error Resume Next
        Set ws = ThisWorkbook.Worksheets(CStr(months(m)))
        On Error GoTo 0
        If ws Is Nothing Then GoTo NextMonth

        For r = NH_FIRST_ROW To NH_LAST_ROW
            updates = updates + ApplyRowTraining(ws, r, NH_STATUS_COL, people, True)
        Next r
        For r = TR_FIRST_ROW To TR_LAST_ROW
            updates = updates + ApplyRowTraining(ws, r, TR_STATUS_COL, people, False)
        Next r
NextMonth:
    Next m

    ApplyTrainingDataToSheets = updates
End Function

Private Function ApplyRowTraining(ByVal ws As Worksheet, ByVal rowNum As Long, ByVal statusCol As Long, _
                                  ByRef people As Object, ByVal isNewHireSection As Boolean) As Long
    Dim ln As String, fn As String
    ln = Trim(CStr(ws.Cells(rowNum, COL_LAST_NAME).Value & ""))
    fn = Trim(CStr(ws.Cells(rowNum, COL_FIRST_NAME).Value & ""))
    If ln = "" Then Exit Function
    If IsInactiveStatus(CStr(ws.Cells(rowNum, statusCol).Value & "")) Then Exit Function

    Dim key As String
    key = NameKey(ln, fn)
    If Not people.Exists(key) Then Exit Function

    Dim trainingMap As Object
    Set trainingMap = people(key)

    Dim cprVal As String, medVal As String, ukVal As String, mtVal As String
    cprVal = BestTrainingValue(trainingMap, Array("cpr", "cpr/fa", "firstaid"))
    medVal = BestTrainingValue(trainingMap, Array("med_train"))
    ukVal = BestTrainingValue(trainingMap, Array("ukeru"))
    mtVal = BestTrainingValue(trainingMap, Array("mealtime"))

    Dim changes As Long
    If isNewHireSection Then
        changes = changes + ApplyTrainingCell(ws.Cells(rowNum, NH_CPRFA_COL), cprVal)
        changes = changes + ApplyTrainingCell(ws.Cells(rowNum, NH_MEDCERT_COL), medVal)
        changes = changes + ApplyTrainingCell(ws.Cells(rowNum, NH_UKERU_COL), ukVal)
        changes = changes + ApplyTrainingCell(ws.Cells(rowNum, NH_MEALTIME_COL), mtVal)
    Else
        changes = changes + ApplyTrainingCell(ws.Cells(rowNum, TR_UKERU_COL), ukVal)
        changes = changes + ApplyTrainingCell(ws.Cells(rowNum, TR_MEALTIME_COL), mtVal)
    End If

    ApplyRowTraining = changes
End Function

Private Function ParseTrainingEmployees(ByVal json As String, ByRef people As Object, ByRef employeeCount As Long) As Boolean
    On Error GoTo ParseErr
    Dim sc As Object
    Set sc = CreateObject("ScriptControl")
    sc.Language = "JScript"
    sc.AddCode "function getLength(arr){return arr ? arr.length : 0;}"
    sc.AddCode "function getItem(arr,i){return arr[i];}"
    sc.AddCode "function getProp(obj,key){return obj ? obj[key] : null;}"
    sc.AddCode "function text(v){return (v===null||v===undefined)?'':String(v);}"

    Dim root As Object, emps As Object
    Set root = sc.Eval("(" & json & ")")
    Set emps = sc.Run("getProp", root, "employees")

    Dim i As Long, eCount As Long
    eCount = sc.Run("getLength", emps)
    employeeCount = eCount

    For i = 0 To eCount - 1
        Dim emp As Object
        Set emp = sc.Run("getItem", emps, i)

        Dim ln As String, fn As String
        ln = LCase(Trim(CStr(sc.Run("text", sc.Run("getProp", emp, "last_name")))))
        fn = LCase(Trim(CStr(sc.Run("text", sc.Run("getProp", emp, "first_name")))))
        If ln = "" Then GoTo NextEmp

        Dim map As Object
        Set map = CreateObject("Scripting.Dictionary")
        map.CompareMode = vbTextCompare

        Dim trainings As Object, tCount As Long, t As Long
        Set trainings = sc.Run("getProp", emp, "trainings")
        tCount = sc.Run("getLength", trainings)

        For t = 0 To tCount - 1
            Dim tr As Object
            Set tr = sc.Run("getItem", trainings, t)
            Dim colKey As String, trainingName As String, status As String, completionDate As String
            colKey = LCase(Trim(CStr(sc.Run("text", sc.Run("getProp", tr, "column_key")))))
            trainingName = LCase(Trim(CStr(sc.Run("text", sc.Run("getProp", tr, "training_name")))))
            status = LCase(Trim(CStr(sc.Run("text", sc.Run("getProp", tr, "status")))))
            completionDate = Trim(CStr(sc.Run("text", sc.Run("getProp", tr, "completion_date"))))

            Dim val As String
            If status = "excused" Then
                val = "N/A"
            ElseIf completionDate <> "" And IsDate(completionDate) Then
                val = Format(CDate(completionDate), "yyyy-mm-dd")
            Else
                val = ""
            End If

            If val <> "" Then
                If colKey <> "" Then AddTrainingValue map, colKey, val
                If trainingName <> "" Then AddTrainingValue map, trainingName, val
            End If
        Next t

        people(NameKey(ln, fn)) = map
NextEmp:
    Next i

    ParseTrainingEmployees = True
    Exit Function
ParseErr:
    ParseTrainingEmployees = False
End Function

Private Sub ParseNewHireSummary(ByVal json As String, ByRef created As Long, ByRef updated As Long, ByRef reactivated As Long, _
                                ByRef unchanged As Long, ByRef ambiguous As Long, ByRef failed As Long)
    On Error GoTo Fallback
    Dim sc As Object, root As Object, summary As Object
    Set sc = CreateObject("ScriptControl")
    sc.Language = "JScript"
    sc.AddCode "function getProp(obj,key){return obj ? obj[key] : null;}"
    sc.AddCode "function asNum(v){return (v===null||v===undefined||isNaN(Number(v))) ? 0 : Number(v);}"
    Set root = sc.Eval("(" & json & ")")
    Set summary = sc.Run("getProp", root, "summary")
    created = CLng(sc.Run("asNum", sc.Run("getProp", summary, "created")))
    updated = CLng(sc.Run("asNum", sc.Run("getProp", summary, "updated")))
    reactivated = CLng(sc.Run("asNum", sc.Run("getProp", summary, "reactivated")))
    unchanged = CLng(sc.Run("asNum", sc.Run("getProp", summary, "unchanged")))
    ambiguous = CLng(sc.Run("asNum", sc.Run("getProp", summary, "ambiguous")))
    failed = CLng(sc.Run("asNum", sc.Run("getProp", summary, "failed")))
    Exit Sub
Fallback:
    created = 0: updated = 0: reactivated = 0: unchanged = 0: ambiguous = 0: failed = 0
End Sub

Private Sub ResolveSectionColumns(ByVal ws As Worksheet, ByVal headerRow As Long, ByRef cols As SectionColumns)
    cols.IdCol = FindHeaderColumn(ws, headerRow, Array("id", "employee id", "paylocity id"), FALLBACK_ID_COL)
    cols.PositionCol = FindHeaderColumn(ws, headerRow, Array("position / job title", "position", "position title", "job title"), FALLBACK_POSITION_COL)
    cols.HireDateCol = FindHeaderColumn(ws, headerRow, Array("hire date", "date of hire", "doh"), FALLBACK_HIRE_DATE_COL)
    cols.DivisionCol = FindHeaderColumn(ws, headerRow, Array("division", "division description"), FALLBACK_DIVISION_COL)
    cols.DepartmentCol = FindHeaderColumn(ws, headerRow, Array("department", "department description"), FALLBACK_DEPARTMENT_COL)
End Sub

Private Function FindHeaderColumn(ByVal ws As Worksheet, ByVal headerRow As Long, ByVal aliases As Variant, ByVal fallbackCol As Long) As Long
    Dim lastCol As Long, c As Long
    lastCol = ws.Cells(headerRow, ws.Columns.Count).End(xlToLeft).Column
    If lastCol < 1 Then lastCol = 30

    For c = 1 To lastCol
        Dim h As String
        h = LCase(Trim(CStr(ws.Cells(headerRow, c).Value & "")))
        If h <> "" Then
            Dim a As Long
            For a = LBound(aliases) To UBound(aliases)
                If h = LCase(CStr(aliases(a))) Then
                    FindHeaderColumn = c
                    Exit Function
                End If
            Next a
        End If
    Next c

    FindHeaderColumn = fallbackCol
End Function

Private Function MonthSheetNames() As Variant
    MonthSheetNames = Array("January", "February", "March", "April", "May", "June", _
                            "July", "August", "September", "October", "November", "December")
End Function

Private Function HttpJson(ByVal method As String, ByVal url As String, ByVal body As String, ByRef responseText As String) As Long
    On Error Resume Next
    Dim req As Object
    Set req = CreateObject("WinHttp.WinHttpRequest.5.1")
    If Err.Number <> 0 Then Err.Clear: GoTo TryXml
    req.setTimeouts 10000, 10000, 15000, 30000
    req.Open method, url, False
    req.SetRequestHeader "Content-Type", "application/json"
    req.SetRequestHeader "Accept", "application/json"
    req.SetRequestHeader "x-hub-sync-token", HUB_SYNC_TOKEN
    req.Send body
    HttpJson = req.Status
    responseText = CStr(req.responseText & "")
    Exit Function
TryXml:
    Dim x As Object
    Set x = CreateObject("MSXML2.ServerXMLHTTP.6.0")
    If Err.Number <> 0 Then HttpJson = 0: responseText = "": Exit Function
    x.setTimeouts 10000, 10000, 15000, 30000
    x.Open method, url, False
    x.setRequestHeader "Content-Type", "application/json"
    x.setRequestHeader "Accept", "application/json"
    x.setRequestHeader "x-hub-sync-token", HUB_SYNC_TOKEN
    x.Send body
    HttpJson = x.Status
    responseText = CStr(x.responseText & "")
End Function

Private Function ToYmd(ByVal v As Variant) As String
    If IsDate(v) Then
        ToYmd = Format(CDate(v), "yyyy-mm-dd")
    Else
        Dim s As String
        s = Trim(CStr(v & ""))
        If Len(s) = 10 And Mid(s, 5, 1) = "-" And Mid(s, 8, 1) = "-" Then
            ToYmd = s
        End If
    End If
End Function

Private Function JsonEscape(ByVal s As String) As String
    s = Replace(s, "\", "\\")
    s = Replace(s, Chr$(34), "\" & Chr$(34))
    s = Replace(s, vbCrLf, " ")
    s = Replace(s, vbCr, " ")
    s = Replace(s, vbLf, " ")
    JsonEscape = s
End Function

Private Function JsonStringOrNull(ByVal s As String) As String
    If Len(Trim(s)) = 0 Then
        JsonStringOrNull = "null"
    Else
        JsonStringOrNull = """" & JsonEscape(s) & """"
    End If
End Function

Private Function JoinCollection(ByVal parts As Collection, ByVal sep As String) As String
    Dim i As Long
    For i = 1 To parts.Count
        If i > 1 Then JoinCollection = JoinCollection & sep
        JoinCollection = JoinCollection & CStr(parts(i))
    Next i
End Function

Private Function IsInactiveStatus(ByVal s As String) As Boolean
    Dim v As String
    v = UCase(Trim(s))
    IsInactiveStatus = (v = "TERMINATED" Or v = "RESIGNED" Or v = "NCNS" Or v = "QUIT")
End Function

Private Function NameKey(ByVal ln As String, ByVal fn As String) As String
    NameKey = LCase(Trim(ln)) & "|" & LCase(Trim(fn))
End Function

Private Sub AddTrainingValue(ByRef map As Object, ByVal key As String, ByVal newVal As String)
    If Not map.Exists(key) Then
        map.Add key, newVal
        Exit Sub
    End If
    Dim oldVal As String
    oldVal = CStr(map(key))
    If UCase(oldVal) = "N/A" Then Exit Sub
    If UCase(newVal) = "N/A" Then
        map(key) = "N/A"
        Exit Sub
    End If
    If IsDate(oldVal) And IsDate(newVal) Then
        If CDate(newVal) > CDate(oldVal) Then map(key) = newVal
    End If
End Sub

Private Function BestTrainingValue(ByRef map As Object, ByVal keys As Variant) As String
    Dim i As Long
    For i = LBound(keys) To UBound(keys)
        Dim k As String
        k = LCase(CStr(keys(i)))
        If map.Exists(k) Then
            If UCase(CStr(map(k))) = "N/A" Then
                BestTrainingValue = "N/A"
                Exit Function
            End If
        End If
    Next i

    Dim best As Date, found As Boolean
    For i = LBound(keys) To UBound(keys)
        Dim key As String
        key = LCase(CStr(keys(i)))
        If map.Exists(key) Then
            Dim val As String
            val = CStr(map(key))
            If IsDate(val) Then
                If Not found Or CDate(val) > best Then
                    best = CDate(val)
                    found = True
                End If
            End If
        End If
    Next i
    If found Then BestTrainingValue = Format(best, "yyyy-mm-dd")
End Function

Private Function ApplyTrainingCell(ByRef target As Range, ByVal valueFromHub As String) As Long
    If Len(valueFromHub) = 0 Then Exit Function
    If UCase(valueFromHub) = "N/A" Then
        If UCase(Trim(CStr(target.Value & ""))) <> "N/A" Then
            target.Value = "N/A"
            ApplyTrainingCell = 1
        End If
        Exit Function
    End If
    If Not IsDate(valueFromHub) Then Exit Function

    Dim shownDate As String
    shownDate = Format(CDate(valueFromHub), "MM/DD/YYYY")
    If UCase(Trim(CStr(target.Value & ""))) = "YES" Then
        If Not target.Comment Is Nothing Then
            If InStr(1, target.Comment.Text, shownDate, vbTextCompare) > 0 Then Exit Function
        End If
    End If

    If Not target.Comment Is Nothing Then target.Comment.Delete
    target.Value = "Yes"
    target.AddComment "Completed: " & shownDate
    ApplyTrainingCell = 1
End Function

Attribute VB_Name = "HubSync"
Option Explicit

' ============================================================
' FY Separation Summary -> Hub sync module
' ============================================================
' PURPOSE
'   1) Push separation rows to the hub API so employees are marked
'      inactive in Supabase.
'   2) Pull Date of Hire (DOH) from the hub API for blank DOH cells.
'   3) Keep richer sync history and a rolling headcount ledger.
'
' This module is hub-native:
'   - Uses /api/sync/separations for terminations
'   - Uses /api/sync/roster for employee roster / hire dates
'   - Uses /api/sync/roster (active only) for running headcount
'
' Supabase remains the source of truth; the hub endpoints are the
' automation gateway that already enforces token auth and server logic.
' ============================================================

' --------- REQUIRED CONFIG ---------
Private Const HUB_BASE_URL As String = "https://your-hub-domain.example.com"
Private Const HUB_SYNC_TOKEN As String = "replace-with-your-hub-sync-token"

' --------- FY sheet layout ---------
Private Const COL_NAME As Long = 1       ' A
Private Const COL_DOS As Long = 2        ' B (Date of Separation)
Private Const COL_DOH As Long = 3        ' C (Date of Hire)

Private Const DATA_FIRST_ROW As Long = 9
Private Const DATA_LAST_ROW As Long = 413

' --------- Internal sheets ---------
Private Const LOG_SHEET As String = "Sync Log"
Private Const HEADCOUNT_SHEET As String = "Headcount Ledger"

Public Sub HubSync()
    Dim answer As VbMsgBoxResult
    answer = MsgBox( _
        "Push pending separations to the hub?" & vbCrLf & vbCrLf & _
        "Rows on the current FY sheet with a due Date of Separation" & vbCrLf & _
        "will be sent to /api/sync/separations. Results are written" & vbCrLf & _
        "to Sync Log and a headcount snapshot is appended.", _
        vbYesNo + vbQuestion, "Hub Sync")
    If answer <> vbYes Then Exit Sub

    RunHubSync False
End Sub

Public Sub PullHireDates()
    Dim answer As VbMsgBoxResult
    answer = MsgBox( _
        "Pull Date of Hire values from the hub?" & vbCrLf & vbCrLf & _
        "Every FY sheet row with a name and blank DOH will be looked" & vbCrLf & _
        "up from /api/sync/roster?include_inactive=true." & vbCrLf & _
        "Existing DOH values are never overwritten.", _
        vbYesNo + vbQuestion, "Pull Hire Dates")
    If answer <> vbYes Then Exit Sub

    RunPullHireDates False
End Sub

Public Sub SnapshotHeadcount()
    Dim synced As Long, alreadyInactive As Long, noMatch As Long, failed As Long
    RecordHeadcountSnapshot "MANUAL_SNAPSHOT", "", synced, alreadyInactive, noMatch, failed, "Manual snapshot"
    MsgBox "Headcount snapshot recorded.", vbInformation, "Headcount Ledger"
End Sub

Private Sub RunHubSync(ByVal silent As Boolean)
    Dim wsFY As Worksheet
    Set wsFY = GetCurrentFYSheet()
    If wsFY Is Nothing Then
        If Not silent Then MsgBox "Could not determine current FY sheet from Dashboard!B5.", vbExclamation, "Hub Sync"
        Exit Sub
    End If

    Dim wsLog As Worksheet
    Set wsLog = EnsureLogSheet()
    EnsureHeadcountSheet

    Dim syncedKeys As Object
    Set syncedKeys = LoadSyncedKeys(wsLog)

    Dim payloadParts As Collection
    Set payloadParts = New Collection

    Dim metaByRow As Object
    Set metaByRow = CreateObject("Scripting.Dictionary")
    metaByRow.CompareMode = vbTextCompare

    Dim queued As Long, skippedLocal As Long
    CollectSeparationRows wsFY, syncedKeys, payloadParts, metaByRow, queued, skippedLocal

    If queued = 0 Then
        Dim zero As Long
        RecordHeadcountSnapshot "SEPARATION_SYNC", wsFY.Name, zero, zero, zero, zero, "No eligible rows to push"
        If Not silent Then
            MsgBox "No eligible separation rows found." & vbCrLf & _
                   "Skipped locally: " & skippedLocal, vbInformation, "Hub Sync"
        End If
        Exit Sub
    End If

    Dim payload As String
    payload = "{""separations"":[" & JoinCollection(payloadParts, ",") & "]}"

    Application.StatusBar = "Pushing " & queued & " separation rows to hub..."
    Dim responseText As String, statusCode As Long
    statusCode = HttpJson("POST", BuildHubUrl("/api/sync/separations"), payload, responseText)
    Application.StatusBar = False

    Dim synced As Long, alreadyInactive As Long, noMatch As Long, ambiguous As Long, failed As Long
    If statusCode < 200 Or statusCode >= 300 Then
        failed = queued
        LogApiFailureRows wsLog, metaByRow, "HTTP " & statusCode & " " & Left(responseText, 300)
        RecordHeadcountSnapshot "SEPARATION_SYNC", wsFY.Name, synced, alreadyInactive, noMatch, failed, "Hub call failed"
        If Not silent Then
            MsgBox "Hub sync failed: HTTP " & statusCode & vbCrLf & Left(responseText, 700), vbExclamation, "Hub Sync"
        End If
        Exit Sub
    End If

    If Not ProcessSeparationResults(responseText, wsLog, metaByRow, syncedKeys, synced, alreadyInactive, noMatch, ambiguous, failed) Then
        failed = queued
        LogApiFailureRows wsLog, metaByRow, "Could not parse /api/sync/separations response"
    End If

    RecordHeadcountSnapshot "SEPARATION_SYNC", wsFY.Name, synced, alreadyInactive, noMatch, failed, "Hub separation push"

    If Not silent Then
        MsgBox "Hub Sync complete on " & wsFY.Name & vbCrLf & vbCrLf & _
               "  queued:          " & queued & vbCrLf & _
               "  skipped locally: " & skippedLocal & vbCrLf & _
               "  synced:          " & synced & vbCrLf & _
               "  already inactive:" & alreadyInactive & vbCrLf & _
               "  no match:        " & noMatch & vbCrLf & _
               "  ambiguous:       " & ambiguous & vbCrLf & _
               "  failed:          " & failed, _
               vbInformation, "Hub Sync"
    End If
End Sub

Private Sub CollectSeparationRows(ByVal wsFY As Worksheet, ByRef syncedKeys As Object, _
                                  ByRef payloadParts As Collection, ByRef metaByRow As Object, _
                                  ByRef queued As Long, ByRef skippedLocal As Long)
    Dim r As Long
    Dim today As Date
    today = Date

    For r = DATA_FIRST_ROW To DATA_LAST_ROW
        Dim rawName As String
        rawName = Trim(CStr(wsFY.Cells(r, COL_NAME).Value & ""))
        If rawName = "" Or LCase(rawName) = "subtotal:" Then GoTo SkipRow

        Dim dosVal As Variant
        dosVal = wsFY.Cells(r, COL_DOS).Value
        If Not IsDate(dosVal) Then GoTo SkipRow

        Dim dosDate As Date
        dosDate = CDate(dosVal)
        If dosDate > today Then GoTo SkipRow

        Dim dedupeKey As String
        dedupeKey = BuildKey(wsFY.Name, r, rawName, dosDate)
        If syncedKeys.Exists(dedupeKey) Then GoTo SkipRow

        Dim firstName As String, lastName As String
        SplitName rawName, firstName, lastName
        If Len(lastName) = 0 Then GoTo SkipRow

        Dim rowToken As String
        rowToken = BuildRowToken(wsFY.Name, r)

        Dim obj As String
        obj = "{"
        obj = obj & """last_name"":""" & JsonEscape(lastName) & ""","
        obj = obj & """first_name"":""" & JsonEscape(firstName) & ""","
        obj = obj & """date_of_separation"":""" & Format(dosDate, "yyyy-mm-dd") & ""","
        obj = obj & """sheet"":""" & JsonEscape(wsFY.Name) & ""","
        obj = obj & """row_number"":" & CStr(r)
        obj = obj & "}"
        payloadParts.Add obj

        metaByRow(rowToken) = Array(wsFY.Name, CLng(r), rawName, dosDate, dedupeKey)
        queued = queued + 1
        GoTo NextRow
SkipRow:
        skippedLocal = skippedLocal + 1
NextRow:
    Next r
End Sub

Private Function ProcessSeparationResults(ByVal json As String, ByVal wsLog As Worksheet, ByRef metaByRow As Object, _
                                          ByRef syncedKeys As Object, ByRef synced As Long, ByRef alreadyInactive As Long, _
                                          ByRef noMatch As Long, ByRef ambiguous As Long, ByRef failed As Long) As Boolean
    On Error GoTo ParseErr

    Dim sc As Object
    Set sc = CreateObject("ScriptControl")
    sc.Language = "JScript"
    sc.AddCode "function getProp(obj,key){return obj ? obj[key] : null;}"
    sc.AddCode "function getItem(arr,i){return arr[i];}"
    sc.AddCode "function getLength(arr){return arr ? arr.length : 0;}"
    sc.AddCode "function text(v){return (v===null||v===undefined)?'':String(v);}"
    sc.AddCode "function num(v){return (v===null||v===undefined||isNaN(Number(v)))?0:Number(v);}"

    Dim root As Object, results As Object
    Set root = sc.Eval("(" & json & ")")
    Set results = sc.Run("getProp", root, "results")

    Dim i As Long, cnt As Long
    cnt = CLng(sc.Run("getLength", results))
    For i = 0 To cnt - 1
        Dim item As Object, inputObj As Object
        Set item = sc.Run("getItem", results, i)
        Set inputObj = sc.Run("getProp", item, "input")

        Dim sheetName As String
        sheetName = CStr(sc.Run("text", sc.Run("getProp", item, "sheet")))
        Dim rowNum As Long
        rowNum = CLng(sc.Run("num", sc.Run("getProp", item, "row_number")))
        Dim rowToken As String
        rowToken = BuildRowToken(sheetName, rowNum)

        Dim status As String
        status = LCase(CStr(sc.Run("text", sc.Run("getProp", item, "status"))))
        Dim employeeId As String
        employeeId = CStr(sc.Run("text", sc.Run("getProp", item, "employee_id")))
        Dim matchType As String
        matchType = UCase(CStr(sc.Run("text", sc.Run("getProp", item, "match_type"))))
        Dim message As String
        message = CStr(sc.Run("text", sc.Run("getProp", item, "message")))

        Dim empName As String, dosDate As Date, dedupeKey As String
        If metaByRow.Exists(rowToken) Then
            Dim meta As Variant
            meta = metaByRow(rowToken)
            empName = CStr(meta(2))
            dosDate = CDate(meta(3))
            dedupeKey = CStr(meta(4))
        Else
            Dim firstName As String, lastName As String, dosText As String
            lastName = CStr(sc.Run("text", sc.Run("getProp", inputObj, "last_name")))
            firstName = CStr(sc.Run("text", sc.Run("getProp", inputObj, "first_name")))
            dosText = CStr(sc.Run("text", sc.Run("getProp", inputObj, "date_of_separation")))
            empName = Trim(firstName & " " & lastName)
            If IsDate(dosText) Then
                dosDate = CDate(dosText)
            Else
                dosDate = Date
            End If
            dedupeKey = BuildKey(sheetName, rowNum, empName, dosDate)
        End If

        Dim action As String
        Select Case status
            Case "synced"
                action = "SYNCED"
                synced = synced + 1
                syncedKeys(dedupeKey) = True
            Case "already_inactive"
                action = "ALREADY_INACTIVE"
                alreadyInactive = alreadyInactive + 1
                syncedKeys(dedupeKey) = True
            Case "no_match"
                action = "NO_MATCH"
                noMatch = noMatch + 1
            Case "ambiguous"
                action = "AMBIGUOUS"
                ambiguous = ambiguous + 1
            Case Else
                action = "FAILED"
                failed = failed + 1
        End Select

        LogRow wsLog, sheetName, rowNum, empName, dosDate, action, employeeId, matchType, message
    Next i

    ProcessSeparationResults = True
    Exit Function
ParseErr:
    ProcessSeparationResults = False
End Function

Private Sub LogApiFailureRows(ByVal wsLog As Worksheet, ByRef metaByRow As Object, ByVal details As String)
    Dim key As Variant
    For Each key In metaByRow.Keys
        Dim meta As Variant
        meta = metaByRow(key)
        LogRow wsLog, CStr(meta(0)), CLng(meta(1)), CStr(meta(2)), CDate(meta(3)), "FAILED", "", "", details
    Next key
End Sub

Private Sub RunPullHireDates(ByVal silent As Boolean)
    Application.StatusBar = "Fetching roster from hub..."
    Dim rosterJson As String, statusCode As Long
    statusCode = HttpJson("GET", BuildHubUrl("/api/sync/roster?include_inactive=true"), "", rosterJson)
    Application.StatusBar = False

    If statusCode < 200 Or statusCode >= 300 Then
        If Not silent Then
            MsgBox "Could not fetch roster from hub. HTTP " & statusCode & vbCrLf & Left(rosterJson, 700), vbExclamation, "Pull Hire Dates"
        End If
        Exit Sub
    End If

    Dim emps As Collection
    Set emps = ParseEmployeeWithHireJson(rosterJson)
    If emps.Count = 0 Then
        If Not silent Then MsgBox "Hub returned zero employees.", vbExclamation, "Pull Hire Dates"
        Exit Sub
    End If

    Dim wsLog As Worksheet
    Set wsLog = EnsureLogSheet()

    Application.ScreenUpdating = False
    Application.Calculation = xlCalculationManual

    Dim fyNames As Variant
    fyNames = Array( _
        "FY 2023 (Jan23-Dec23)", _
        "FY 2024 (Jan24-Dec24)", _
        "FY 2025 (Jan25-Dec25)", _
        "FY 2026 (Jan26-Dec26)", _
        "FY 2027 (Jan27-Dec27)")

    Dim filled As Long, noMatch As Long, missingHire As Long, skipped As Long
    Dim k As Long

    For k = LBound(fyNames) To UBound(fyNames)
        Dim wsFY As Worksheet
        Set wsFY = Nothing
        On Error Resume Next
        Set wsFY = ThisWorkbook.Worksheets(CStr(fyNames(k)))
        On Error GoTo 0
        If wsFY Is Nothing Then GoTo NextSheet

        Application.StatusBar = "Backfilling " & wsFY.Name & "..."

        Dim r As Long
        For r = DATA_FIRST_ROW To DATA_LAST_ROW
            Dim nameVal As String
            nameVal = Trim(CStr(wsFY.Cells(r, COL_NAME).Value & ""))
            If nameVal = "" Or LCase(nameVal) = "subtotal:" Then GoTo NextRow

            Dim existing As Variant
            existing = wsFY.Cells(r, COL_DOH).Value
            If IsDate(existing) Or Len(Trim(CStr(existing & ""))) > 0 Then
                skipped = skipped + 1
                GoTo NextRow
            End If

            Dim firstName As String, lastName As String
            SplitName nameVal, firstName, lastName

            Dim match As Variant
            match = FindEmployeeWithHire(emps, firstName, lastName)
            If IsEmpty(match) Then
                noMatch = noMatch + 1
                GoTo NextRow
            End If

            Dim hireDateText As String
            hireDateText = CStr(match(3))
            If Len(hireDateText) = 0 Or LCase(hireDateText) = "null" Then
                missingHire = missingHire + 1
                GoTo NextRow
            End If

            If Not IsDate(hireDateText) Then
                missingHire = missingHire + 1
                GoTo NextRow
            End If

            wsFY.Cells(r, COL_DOH).Value = CDate(hireDateText)
            filled = filled + 1
            LogRow wsLog, wsFY.Name, r, nameVal, CDate(hireDateText), "DOH_FILLED", CStr(match(0)), CStr(match(4)), ""
NextRow:
        Next r
NextSheet:
    Next k

    Application.Calculation = xlCalculationAutomatic
    Application.ScreenUpdating = True
    Application.StatusBar = False

    Dim zero As Long
    RecordHeadcountSnapshot "PULL_HIRE_DATES", "", zero, zero, zero, zero, "DOH backfill run"

    MsgBox "Pull Hire Dates complete." & vbCrLf & vbCrLf & _
           "  filled:       " & filled & vbCrLf & _
           "  skipped:      " & skipped & " (already had value)" & vbCrLf & _
           "  no match:     " & noMatch & vbCrLf & _
           "  no hire_date: " & missingHire, _
           vbInformation, "Pull Hire Dates"
End Sub

Private Sub RecordHeadcountSnapshot(ByVal eventName As String, ByVal fySheet As String, _
                                    ByVal synced As Long, ByVal alreadyInactive As Long, _
                                    ByVal noMatch As Long, ByVal failed As Long, ByVal note As String)
    Dim ws As Worksheet
    Set ws = EnsureHeadcountSheet()

    Dim activeCount As Long
    activeCount = FetchActiveHeadcount()
    If activeCount < 0 Then Exit Sub

    Dim prev As Variant
    prev = LastNumericInColumn(ws, 4)

    Dim delta As Long
    If IsNumeric(prev) Then
        delta = activeCount - CLng(prev)
    Else
        delta = 0
    End If

    Dim inferredHires As Long
    inferredHires = delta + synced

    Dim nextRow As Long
    nextRow = ws.Cells(ws.Rows.Count, 1).End(xlUp).Row + 1
    If nextRow < 2 Then nextRow = 2

    ws.Cells(nextRow, 1).Value = Now
    ws.Cells(nextRow, 2).Value = eventName
    ws.Cells(nextRow, 3).Value = fySheet
    ws.Cells(nextRow, 4).Value = activeCount
    ws.Cells(nextRow, 5).Value = delta
    ws.Cells(nextRow, 6).Value = synced
    ws.Cells(nextRow, 7).Value = alreadyInactive
    ws.Cells(nextRow, 8).Value = noMatch
    ws.Cells(nextRow, 9).Value = failed
    ws.Cells(nextRow, 10).Value = inferredHires
    ws.Cells(nextRow, 11).Value = note
End Sub

Private Function FetchActiveHeadcount() As Long
    Dim json As String, statusCode As Long
    statusCode = HttpJson("GET", BuildHubUrl("/api/sync/roster"), "", json)
    If statusCode < 200 Or statusCode >= 300 Then
        FetchActiveHeadcount = -1
        Exit Function
    End If

    On Error GoTo ParseErr
    Dim sc As Object, root As Object, emps As Object
    Set sc = CreateObject("ScriptControl")
    sc.Language = "JScript"
    sc.AddCode "function getProp(obj,key){return obj ? obj[key] : null;}"
    sc.AddCode "function getLength(arr){return arr ? arr.length : 0;}"
    Set root = sc.Eval("(" & json & ")")
    Set emps = sc.Run("getProp", root, "employees")
    FetchActiveHeadcount = CLng(sc.Run("getLength", emps))
    Exit Function
ParseErr:
    FetchActiveHeadcount = -1
End Function

Private Function ParseEmployeeWithHireJson(ByVal json As String) As Collection
    Dim out As New Collection
    On Error GoTo ParseErr

    Dim sc As Object
    Set sc = CreateObject("ScriptControl")
    sc.Language = "JScript"
    sc.AddCode "function getProp(obj,key){return obj ? obj[key] : null;}"
    sc.AddCode "function getItem(arr,i){return arr[i];}"
    sc.AddCode "function getLength(arr){return arr ? arr.length : 0;}"
    sc.AddCode "function text(v){return (v===null||v===undefined)?'':String(v);}"

    Dim root As Object, emps As Object
    Set root = sc.Eval("(" & json & ")")
    Set emps = sc.Run("getProp", root, "employees")

    Dim i As Long, cnt As Long
    cnt = CLng(sc.Run("getLength", emps))
    For i = 0 To cnt - 1
        Dim item As Object
        Set item = sc.Run("getItem", emps, i)
        Dim rec(0 To 4) As String
        rec(0) = CStr(sc.Run("text", sc.Run("getProp", item, "id")))
        rec(1) = CStr(sc.Run("text", sc.Run("getProp", item, "first_name")))
        rec(2) = CStr(sc.Run("text", sc.Run("getProp", item, "last_name")))
        rec(3) = CStr(sc.Run("text", sc.Run("getProp", item, "hire_date")))
        rec(4) = ""
        out.Add rec
    Next i

    Set ParseEmployeeWithHireJson = out
    Exit Function
ParseErr:
    Set ParseEmployeeWithHireJson = out
End Function

Private Function FindEmployeeWithHire(ByVal emps As Collection, ByVal firstName As String, ByVal lastName As String) As Variant
    If Len(lastName) = 0 Then Exit Function

    Dim rec As Variant
    Dim lLower As String, fLower As String
    lLower = LCase(lastName)
    fLower = LCase(firstName)

    For Each rec In emps
        If LCase(rec(2)) = lLower And LCase(rec(1)) = fLower Then
            rec(4) = "EXACT"
            FindEmployeeWithHire = rec
            Exit Function
        End If
    Next rec

    If Len(fLower) > 0 Then
        For Each rec In emps
            If LCase(rec(2)) = lLower Then
                If Len(rec(1)) > 0 And InStr(1, LCase(rec(1)), fLower, vbBinaryCompare) = 1 Then
                    rec(4) = "PARTIAL"
                    FindEmployeeWithHire = rec
                    Exit Function
                End If
            End If
        Next rec
    End If

    Dim matches As Long
    Dim lastCandidate As Variant
    For Each rec In emps
        If LCase(rec(2)) = lLower Then
            matches = matches + 1
            lastCandidate = rec
            If matches > 1 Then Exit For
        End If
    Next rec

    If matches = 1 Then
        lastCandidate(4) = "LAST_ONLY"
        FindEmployeeWithHire = lastCandidate
    End If
End Function

Private Function GetCurrentFYSheet() As Worksheet
    Dim fy As String
    On Error Resume Next
    fy = CStr(ThisWorkbook.Worksheets("Dashboard").Range("B5").Value)
    On Error GoTo 0
    If Len(fy) = 0 Then Exit Function

    Dim yy As String
    yy = Right(fy, 2)
    Dim sheetName As String
    sheetName = fy & " (Jan" & yy & "-Dec" & yy & ")"

    On Error Resume Next
    Set GetCurrentFYSheet = ThisWorkbook.Worksheets(sheetName)
    On Error GoTo 0
End Function

Private Sub SplitName(ByVal raw As String, ByRef firstName As String, ByRef lastName As String)
    Dim s As String, pos As Long
    s = Trim(raw)
    pos = InStrRev(s, " ")
    If pos > 0 Then
        firstName = Trim(Left(s, pos - 1))
        lastName = Trim(Mid(s, pos + 1))
    Else
        firstName = ""
        lastName = s
    End If
End Sub

Private Function EnsureLogSheet() As Worksheet
    Dim ws As Worksheet
    On Error Resume Next
    Set ws = ThisWorkbook.Worksheets(LOG_SHEET)
    On Error GoTo 0

    If ws Is Nothing Then
        Set ws = ThisWorkbook.Worksheets.Add(After:=ThisWorkbook.Worksheets(ThisWorkbook.Worksheets.Count))
        ws.Name = LOG_SHEET
        ws.Range("A1:J1").Value = Array( _
            "Timestamp", "Workbook User", "FY Sheet", "Row", _
            "Employee Name", "Separation Date", "Action", _
            "Employee ID", "Match Type", "Details")
        ws.Range("A1:J1").Font.Bold = True
    End If

    Set EnsureLogSheet = ws
End Function

Private Function EnsureHeadcountSheet() As Worksheet
    Dim ws As Worksheet
    On Error Resume Next
    Set ws = ThisWorkbook.Worksheets(HEADCOUNT_SHEET)
    On Error GoTo 0

    If ws Is Nothing Then
        Set ws = ThisWorkbook.Worksheets.Add(After:=ThisWorkbook.Worksheets(ThisWorkbook.Worksheets.Count))
        ws.Name = HEADCOUNT_SHEET
        ws.Range("A1:K1").Value = Array( _
            "Timestamp", "Event", "FY Sheet", "Active Employees", "Delta vs Prior", _
            "Separations Synced", "Already Inactive", "No Match", "Failed", _
            "Estimated New Hires Since Prior", "Note")
        ws.Range("A1:K1").Font.Bold = True
    End If

    Set EnsureHeadcountSheet = ws
End Function

Private Function BuildKey(ByVal sheetName As String, ByVal rowNum As Long, _
                          ByVal empName As String, ByVal dos As Date) As String
    BuildKey = sheetName & "|" & rowNum & "|" & LCase(empName) & "|" & Format(dos, "yyyy-mm-dd")
End Function

Private Function BuildRowToken(ByVal sheetName As String, ByVal rowNum As Long) As String
    BuildRowToken = sheetName & "|" & CStr(rowNum)
End Function

Private Function LoadSyncedKeys(ByVal wsLog As Worksheet) As Object
    Dim d As Object
    Set d = CreateObject("Scripting.Dictionary")
    d.CompareMode = vbTextCompare

    Dim lastRow As Long
    lastRow = wsLog.Cells(wsLog.Rows.Count, 1).End(xlUp).Row
    If lastRow < 2 Then
        Set LoadSyncedKeys = d
        Exit Function
    End If

    Dim r As Long
    For r = 2 To lastRow
        Dim action As String
        action = UCase(Trim(CStr(wsLog.Cells(r, 7).Value & "")))
        If action = "SYNCED" Or action = "ALREADY_INACTIVE" Then
            Dim sheetName As String, rowNum As Long, empName As String, dosVal As Variant
            sheetName = CStr(wsLog.Cells(r, 3).Value & "")
            rowNum = CLng(Val(CStr(wsLog.Cells(r, 4).Value & "")))
            empName = CStr(wsLog.Cells(r, 5).Value & "")
            dosVal = wsLog.Cells(r, 6).Value
            If IsDate(dosVal) And rowNum > 0 And Len(sheetName) > 0 Then
                d(BuildKey(sheetName, rowNum, empName, CDate(dosVal))) = True
            End If
        End If
    Next r

    Set LoadSyncedKeys = d
End Function

Private Sub LogRow(ByVal ws As Worksheet, ByVal sheetName As String, ByVal rowNum As Long, _
                   ByVal empName As String, ByVal dos As Date, ByVal action As String, _
                   ByVal employeeId As String, ByVal matchType As String, ByVal details As String)
    Dim nextRow As Long
    nextRow = ws.Cells(ws.Rows.Count, 1).End(xlUp).Row + 1
    If nextRow < 2 Then nextRow = 2

    ws.Cells(nextRow, 1).Value = Now
    ws.Cells(nextRow, 2).Value = Environ("USERNAME")
    ws.Cells(nextRow, 3).Value = sheetName
    ws.Cells(nextRow, 4).Value = rowNum
    ws.Cells(nextRow, 5).Value = empName
    ws.Cells(nextRow, 6).Value = dos
    ws.Cells(nextRow, 7).Value = action
    ws.Cells(nextRow, 8).Value = employeeId
    ws.Cells(nextRow, 9).Value = matchType
    ws.Cells(nextRow, 10).Value = details
End Sub

Private Function LastNumericInColumn(ByVal ws As Worksheet, ByVal colNum As Long) As Variant
    Dim r As Long
    r = ws.Cells(ws.Rows.Count, colNum).End(xlUp).Row
    Do While r >= 2
        Dim v As Variant
        v = ws.Cells(r, colNum).Value
        If IsNumeric(v) Then
            LastNumericInColumn = v
            Exit Function
        End If
        r = r - 1
    Loop
    LastNumericInColumn = Empty
End Function

Private Function BuildHubUrl(ByVal path As String) As String
    Dim baseUrl As String
    baseUrl = HUB_BASE_URL
    If Right(baseUrl, 1) = "/" Then baseUrl = Left(baseUrl, Len(baseUrl) - 1)
    If Left(path, 1) <> "/" Then path = "/" & path
    BuildHubUrl = baseUrl & path
End Function

Private Function HttpJson(ByVal method As String, ByVal url As String, ByVal body As String, ByRef responseText As String) As Long
    HttpJson = 0
    responseText = ""
    On Error Resume Next

    Dim req As Object
    Set req = CreateObject("WinHttp.WinHttpRequest.5.1")
    If Err.Number <> 0 Then Err.Clear: GoTo TryXml
    req.setTimeouts 10000, 10000, 15000, 30000
    req.Open method, url, False
    req.SetRequestHeader "Content-Type", "application/json"
    req.SetRequestHeader "Accept", "application/json"
    req.SetRequestHeader "x-hub-sync-token", HUB_SYNC_TOKEN
    If Len(body) > 0 Then req.Send body Else req.Send
    If Err.Number = 0 Then
        HttpJson = req.Status
        responseText = CStr(req.responseText & "")
        Exit Function
    End If
    Err.Clear

TryXml:
    Dim x As Object
    Set x = CreateObject("MSXML2.ServerXMLHTTP.6.0")
    If Err.Number <> 0 Then Exit Function
    x.setTimeouts 10000, 10000, 15000, 30000
    x.Open method, url, False
    x.setRequestHeader "Content-Type", "application/json"
    x.setRequestHeader "Accept", "application/json"
    x.setRequestHeader "x-hub-sync-token", HUB_SYNC_TOKEN
    If Len(body) > 0 Then x.Send body Else x.Send
    If Err.Number = 0 Then
        HttpJson = x.Status
        responseText = CStr(x.responseText & "")
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

Private Function JoinCollection(ByVal parts As Collection, ByVal sep As String) As String
    Dim i As Long
    For i = 1 To parts.Count
        If i > 1 Then JoinCollection = JoinCollection & sep
        JoinCollection = JoinCollection & CStr(parts(i))
    Next i
End Function

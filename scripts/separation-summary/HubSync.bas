Attribute VB_Name = "HubSync"
' ============================================================
' EVC Supabase Sync -- FY Separation Summary
' ============================================================
' HR Program Coordinator: Kyle Mahoney
' Emory Valley Center
' ============================================================
'
' PURPOSE:
'   Pushes separation data FROM the Separation Summary workbook
'   TO the Supabase `employees` table. When a separation row's
'   Date of Separation has arrived (<= TODAY()), the matching
'   employee is marked is_active=false and terminated_at is set
'   to the Date of Separation.
'
'   Results are logged to a "Sync Log" sheet (auto-created on
'   first run). The same Sync Log is also used as the idempotency
'   store: on every run, rows that already have a successful
'   "SYNCED" entry in the log are skipped, so nothing is ever
'   pushed twice.
'
'   This design deliberately does NOT require any column to be
'   added to the FY sheets -- we learned the hard way that
'   mutating the FY sheets programmatically is risky. All sync
'   state lives in the new Sync Log sheet.
'
' WHERE THE DATA COMES FROM:
'   Reads the current FY sheet, determined by Dashboard!B5
'   (e.g. "FY 2026"). Iterates rows 9..max of that sheet.
'
' WHAT THE MACRO DOES PER ROW:
'   Skips the row if any of these is true:
'     * Name (col A) is blank or reads SUBTOTAL:
'     * Date of Separation (col B) is blank, not a date, or still
'       in the future
'     * The Sync Log already contains a SYNCED entry for this
'       (sheet, row, name, dos) tuple
'   Otherwise:
'     1. Look up the employee in Supabase by last+first name.
'     2. PATCH .../rest/v1/employees?id=eq.<id> with
'        { is_active: false, terminated_at: <ISO date> }.
'     3. Append a SYNCED row to the Sync Log.
'
' INSTALL:
'   See scripts/separation-summary/README.md.
'
' ============================================================

Option Explicit

' ============================================================
' CONFIGURATION
' ============================================================
Private Const SUPABASE_URL As String = "https://xkfvipcxnzwyskknkmpj.supabase.co"
Private Const SUPABASE_ANON_KEY As String = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhrZnZpcGN4bnp3eXNra25rbXBqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU2OTY1OTAsImV4cCI6MjA5MTI3MjU5MH0.yPOC0l5oi03V7S7UUrlQhfE87zPkUp_NzAexdzHn2p4"

' --- FY sheet column layout (1-based) ---
Private Const COL_NAME As Long = 1         ' A
Private Const COL_DOS As Long = 2          ' B  Date of Separation
Private Const COL_DOH As Long = 3          ' C  Date of Hire

' --- Data row range on the standardized FY sheets ---
Private Const DATA_FIRST_ROW As Long = 9
' FY 2026 uses 357, the others 413 -- we scan to 413 regardless and
' skip blank rows. Harmless if we walk past the end.
Private Const DATA_LAST_ROW As Long = 413

' --- Sync Log sheet ---
Private Const LOG_SHEET As String = "Sync Log"

' ============================================================
' ENTRY POINTS
' ============================================================

Public Sub HubSync()
    Dim answer As VbMsgBoxResult
    answer = MsgBox( _
        "Push pending separations to the hub?" & vbCrLf & vbCrLf & _
        "For every row on the current FY sheet whose Date of" & vbCrLf & _
        "Separation has arrived and has not yet been synced," & vbCrLf & _
        "the employee will be marked inactive in Supabase and" & vbCrLf & _
        "their terminated_at date will be set." & vbCrLf & vbCrLf & _
        "Previously-synced rows are detected via the Sync Log" & vbCrLf & _
        "sheet and will be skipped.", _
        vbYesNo + vbQuestion, "Hub Sync")
    If answer <> vbYes Then Exit Sub
    RunHubSync False
End Sub

Public Sub Workbook_Open()
    ' Uncomment to auto-sync silently on every open:
    ' RunHubSync True
End Sub

' Button-click / Alt+F8 entry point for backfilling historical
' Date of Hire values from Supabase. Fills only BLANK col C cells
' on any FY sheet -- nothing with a hand-typed or existing value
' is overwritten.
Public Sub PullHireDates()
    Dim answer As VbMsgBoxResult
    answer = MsgBox( _
        "Pull Date of Hire from Supabase for historical rows?" & vbCrLf & vbCrLf & _
        "For every FY sheet, every row that has a name but a" & vbCrLf & _
        "blank DOH cell will be looked up in the hub's" & vbCrLf & _
        "employees table. If a match is found and the employee" & vbCrLf & _
        "has a hire_date, it will be written into the DOH cell." & vbCrLf & vbCrLf & _
        "Existing DOH values are never overwritten.", _
        vbYesNo + vbQuestion, "Pull Hire Dates")
    If answer <> vbYes Then Exit Sub
    RunPullHireDates False
End Sub

' ============================================================
' CORE SYNC
' ============================================================

Private Sub RunHubSync(ByVal silent As Boolean)
    Dim wsFY As Worksheet
    Set wsFY = GetCurrentFYSheet()
    If wsFY Is Nothing Then
        If Not silent Then MsgBox "Could not determine the current FY sheet from Dashboard!B5.", vbExclamation, "Hub Sync"
        Exit Sub
    End If

    Application.StatusBar = "Fetching employees from Supabase..."
    Dim empJson As String
    empJson = HttpGet(SUPABASE_URL & "/rest/v1/employees?select=id,first_name,last_name,is_active&is_active=eq.true")
    If Len(empJson) < 3 Then
        If Not silent Then MsgBox "Could not fetch employees from Supabase. Check your network connection.", vbExclamation, "Hub Sync"
        Application.StatusBar = False
        Exit Sub
    End If

    Dim employees As Collection
    Set employees = ParseEmployeeJson(empJson)
    If employees.Count = 0 Then
        If Not silent Then MsgBox "Supabase returned zero active employees.", vbExclamation, "Hub Sync"
        Application.StatusBar = False
        Exit Sub
    End If

    Dim wsLog As Worksheet
    Set wsLog = EnsureLogSheet()

    ' Load previously-synced keys into a dict for fast lookup.
    Dim syncedKeys As Object
    Set syncedKeys = LoadSyncedKeys(wsLog)

    Application.ScreenUpdating = False
    Application.Calculation = xlCalculationManual

    Dim r As Long
    Dim synced As Long, skipped As Long, failed As Long
    Dim today As Date
    today = Date

    For r = DATA_FIRST_ROW To DATA_LAST_ROW
        Dim name As String, dos As Variant
        name = Trim(CStr(wsFY.Cells(r, COL_NAME).Value & ""))
        If name = "" Or LCase(name) = "subtotal:" Then GoTo NextRow

        dos = wsFY.Cells(r, COL_DOS).Value
        If Not IsDate(dos) Then GoTo NextRow
        If CDate(dos) > today Then GoTo NextRow

        Dim key As String
        key = BuildKey(wsFY.Name, r, name, CDate(dos))
        If syncedKeys.Exists(key) Then
            skipped = skipped + 1
            GoTo NextRow
        End If

        ' Split "First Last" from col A
        Dim firstName As String, lastName As String
        SplitName name, firstName, lastName

        Dim match As Variant
        match = FindEmployee(employees, firstName, lastName)
        If IsEmpty(match) Then
            failed = failed + 1
            LogRow wsLog, wsFY.Name, r, name, CDate(dos), "NO MATCH", "", "", "No active employee in Supabase matches this name"
            GoTo NextRow
        End If

        Dim supId As String, matchType As String
        supId = CStr(match(0))
        matchType = CStr(match(1))

        Dim body As String
        body = "{""is_active"":false,""terminated_at"":""" & Format(CDate(dos), "yyyy-mm-dd") & """}"
        Dim httpStatus As Long, httpBody As String
        httpStatus = HttpPatch(SUPABASE_URL & "/rest/v1/employees?id=eq." & supId, body, httpBody)

        If httpStatus >= 200 And httpStatus < 300 Then
            synced = synced + 1
            LogRow wsLog, wsFY.Name, r, name, CDate(dos), "SYNCED", supId, matchType, ""
            syncedKeys(key) = True
        Else
            failed = failed + 1
            LogRow wsLog, wsFY.Name, r, name, CDate(dos), "PATCH FAIL", supId, matchType, "HTTP " & httpStatus & " " & Left(httpBody, 300)
        End If

NextRow:
    Next r

    Application.Calculation = xlCalculationAutomatic
    Application.ScreenUpdating = True
    Application.StatusBar = False

    If Not silent Or (synced + failed) > 0 Then
        MsgBox "Hub Sync complete on " & wsFY.Name & vbCrLf & vbCrLf & _
               "  synced:  " & synced & vbCrLf & _
               "  skipped: " & skipped & vbCrLf & _
               "  failed:  " & failed, _
               vbInformation, "Hub Sync"
    End If
End Sub

' ============================================================
' PULL HIRE DATES
' ============================================================
' Fills in missing Date of Hire (col C) on every FY sheet by
' matching names against the employees table. Fetches both
' active and inactive employees since historical separations
' correspond to people who have since been terminated.

Private Sub RunPullHireDates(ByVal silent As Boolean)
    Application.StatusBar = "Fetching employees (all states) from Supabase..."
    Dim json As String
    json = HttpGet(SUPABASE_URL & "/rest/v1/employees?select=id,first_name,last_name,hire_date")
    If Len(json) < 3 Then
        If Not silent Then MsgBox "Could not fetch employees from Supabase.", vbExclamation, "Pull Hire Dates"
        Application.StatusBar = False
        Exit Sub
    End If

    Dim emps As Collection
    Set emps = ParseEmployeeWithHireJson(json)
    If emps.Count = 0 Then
        If Not silent Then MsgBox "Supabase returned zero employees.", vbExclamation, "Pull Hire Dates"
        Application.StatusBar = False
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
            Dim name As String
            name = Trim(CStr(wsFY.Cells(r, COL_NAME).Value & ""))
            If name = "" Or LCase(name) = "subtotal:" Then GoTo NextRow

            Dim existing As Variant
            existing = wsFY.Cells(r, COL_DOH).Value
            If IsDate(existing) Then
                skipped = skipped + 1
                GoTo NextRow
            End If
            If Len(Trim(CStr(existing & ""))) > 0 Then
                ' Hand-typed non-date string (historical years) -- never
                ' overwrite.
                skipped = skipped + 1
                GoTo NextRow
            End If

            Dim firstName As String, lastName As String
            SplitName name, firstName, lastName

            Dim match As Variant
            match = FindEmployeeWithHire(emps, firstName, lastName)
            If IsEmpty(match) Then
                noMatch = noMatch + 1
                GoTo NextRow
            End If

            Dim hire As String
            hire = CStr(match(3))
            If Len(hire) = 0 Or hire = "null" Then
                missingHire = missingHire + 1
                GoTo NextRow
            End If

            ' Supabase returns yyyy-mm-dd. Convert to a real date.
            Dim parsed As Date
            On Error Resume Next
            parsed = CDate(hire)
            On Error GoTo 0
            If parsed = 0 Then
                missingHire = missingHire + 1
                GoTo NextRow
            End If

            wsFY.Cells(r, COL_DOH).Value = parsed
            filled = filled + 1
            LogRow wsLog, wsFY.Name, r, name, parsed, "DOH FILLED", CStr(match(0)), CStr(match(4)), ""

NextRow:
        Next r
NextSheet:
    Next k

    Application.Calculation = xlCalculationAutomatic
    Application.ScreenUpdating = True
    Application.StatusBar = False

    MsgBox "Pull Hire Dates complete." & vbCrLf & vbCrLf & _
           "  filled:       " & filled & vbCrLf & _
           "  skipped:      " & skipped & " (already had a value)" & vbCrLf & _
           "  no match:     " & noMatch & vbCrLf & _
           "  no hire_date: " & missingHire, _
           vbInformation, "Pull Hire Dates"
End Sub

' Parse employees?select=id,first_name,last_name,hire_date.
' Returns Collection of Array(id, first, last, hire_date, matchType).
Private Function ParseEmployeeWithHireJson(ByVal json As String) As Collection
    Dim out As New Collection
    Dim i As Long, n As Long
    n = Len(json)
    If n = 0 Then Set ParseEmployeeWithHireJson = out: Exit Function

    Dim depth As Long, objStart As Long
    depth = 0
    For i = 1 To n
        Dim ch As String
        ch = Mid(json, i, 1)
        If ch = "{" Then
            If depth = 0 Then objStart = i
            depth = depth + 1
        ElseIf ch = "}" Then
            depth = depth - 1
            If depth = 0 Then
                Dim obj As String
                obj = Mid(json, objStart, i - objStart + 1)
                Dim rec(0 To 4) As String
                rec(0) = ExtractJsonString(obj, "id")
                rec(1) = ExtractJsonString(obj, "first_name")
                rec(2) = ExtractJsonString(obj, "last_name")
                rec(3) = ExtractJsonString(obj, "hire_date")
                rec(4) = ""  ' matchType filled in below
                out.Add rec
            End If
        End If
    Next i
    Set ParseEmployeeWithHireJson = out
End Function

Private Function FindEmployeeWithHire(ByVal emps As Collection, ByVal firstName As String, ByVal lastName As String) As Variant
    If Len(lastName) = 0 Then Exit Function

    Dim rec As Variant
    Dim lLower As String, fLower As String
    lLower = LCase(lastName)
    fLower = LCase(firstName)

    ' Exact last + exact first
    For Each rec In emps
        If LCase(rec(2)) = lLower And LCase(rec(1)) = fLower Then
            rec(4) = "EXACT"
            FindEmployeeWithHire = rec
            Exit Function
        End If
    Next rec

    ' Exact last + first starts-with
    If Len(fLower) > 0 Then
        For Each rec In emps
            If LCase(rec(2)) = lLower And Len(rec(1)) > 0 _
                    And InStr(1, LCase(rec(1)), fLower, vbBinaryCompare) = 1 Then
                rec(4) = "PARTIAL"
                FindEmployeeWithHire = rec
                Exit Function
            End If
        Next rec
    End If

    ' Exact last only if unique in the dataset
    Dim matches As Long, lastMatch As Variant
    matches = 0
    For Each rec In emps
        If LCase(rec(2)) = lLower Then
            matches = matches + 1
            Set lastMatch = Nothing
            lastMatch = rec
            If matches > 1 Then Exit For
        End If
    Next rec
    If matches = 1 Then
        lastMatch(4) = "LAST_ONLY"
        FindEmployeeWithHire = lastMatch
        Exit Function
    End If
End Function

' ============================================================
' CURRENT FY SHEET RESOLUTION
' ============================================================

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

' ============================================================
' EMPLOYEE FETCH + MATCH
' ============================================================

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

Private Function ParseEmployeeJson(ByVal json As String) As Collection
    Dim out As New Collection
    Dim i As Long, n As Long
    n = Len(json)
    If n = 0 Then Set ParseEmployeeJson = out: Exit Function

    Dim depth As Long, objStart As Long
    depth = 0
    For i = 1 To n
        Dim ch As String
        ch = Mid(json, i, 1)
        If ch = "{" Then
            If depth = 0 Then objStart = i
            depth = depth + 1
        ElseIf ch = "}" Then
            depth = depth - 1
            If depth = 0 Then
                Dim obj As String
                obj = Mid(json, objStart, i - objStart + 1)
                Dim rec(0 To 2) As String
                rec(0) = ExtractJsonString(obj, "id")
                rec(1) = ExtractJsonString(obj, "first_name")
                rec(2) = ExtractJsonString(obj, "last_name")
                out.Add rec
            End If
        End If
    Next i
    Set ParseEmployeeJson = out
End Function

Private Function ExtractJsonString(ByVal obj As String, ByVal key As String) As String
    Dim needle As String
    needle = """" & key & """:"
    Dim p As Long
    p = InStr(obj, needle)
    If p = 0 Then Exit Function
    p = p + Len(needle)
    Do While p <= Len(obj) And (Mid(obj, p, 1) = " " Or Mid(obj, p, 1) = vbTab)
        p = p + 1
    Loop
    If p > Len(obj) Then Exit Function
    Dim first As String
    first = Mid(obj, p, 1)
    If first = """" Then
        Dim q As Long
        q = InStr(p + 1, obj, """")
        If q = 0 Then Exit Function
        ExtractJsonString = Mid(obj, p + 1, q - p - 1)
    Else
        Dim endp As Long
        endp = p
        Do While endp <= Len(obj)
            Dim c As String
            c = Mid(obj, endp, 1)
            If c = "," Or c = "}" Then Exit Do
            endp = endp + 1
        Loop
        ExtractJsonString = Trim(Mid(obj, p, endp - p))
    End If
End Function

Private Function FindEmployee(ByVal employees As Collection, ByVal firstName As String, ByVal lastName As String) As Variant
    If Len(lastName) = 0 Then Exit Function

    Dim rec As Variant, id As String, fn As String, ln As String
    Dim lLower As String, fLower As String
    lLower = LCase(lastName)
    fLower = LCase(firstName)

    For Each rec In employees
        id = rec(0): fn = rec(1): ln = rec(2)
        If LCase(ln) = lLower And LCase(fn) = fLower Then
            FindEmployee = Array(id, "EXACT")
            Exit Function
        End If
    Next rec

    If Len(fLower) > 0 Then
        For Each rec In employees
            id = rec(0): fn = rec(1): ln = rec(2)
            If LCase(ln) = lLower And Len(fn) > 0 And InStr(1, LCase(fn), fLower, vbBinaryCompare) = 1 Then
                FindEmployee = Array(id, "PARTIAL")
                Exit Function
            End If
        Next rec
    End If

    Dim matches As Long, lastMatchId As String
    matches = 0
    For Each rec In employees
        id = rec(0): ln = rec(2)
        If LCase(ln) = lLower Then
            matches = matches + 1
            lastMatchId = id
            If matches > 1 Then Exit For
        End If
    Next rec
    If matches = 1 Then
        FindEmployee = Array(lastMatchId, "LAST_ONLY")
        Exit Function
    End If
End Function

' ============================================================
' SYNC LOG
' ============================================================

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
            "Supabase ID", "Match Type", "Details")
        ws.Range("A1:J1").Font.Bold = True
    End If
    Set EnsureLogSheet = ws
End Function

Private Function BuildKey(ByVal sheetName As String, ByVal rowNum As Long, _
                          ByVal empName As String, ByVal dos As Date) As String
    BuildKey = sheetName & "|" & rowNum & "|" & LCase(empName) & "|" & Format(dos, "yyyy-mm-dd")
End Function

Private Function LoadSyncedKeys(ByVal wsLog As Worksheet) As Object
    Dim d As Object
    Set d = CreateObject("Scripting.Dictionary")
    d.CompareMode = vbTextCompare

    Dim lastRow As Long
    lastRow = wsLog.Cells(wsLog.Rows.Count, 1).End(xlUp).Row
    If lastRow < 2 Then Set LoadSyncedKeys = d: Exit Function

    Dim r As Long
    For r = 2 To lastRow
        Dim action As String
        action = UCase(Trim(CStr(wsLog.Cells(r, 7).Value & "")))
        If action = "SYNCED" Then
            Dim sheetName As String, rowNum As Long, empName As String, dosVal As Variant
            sheetName = CStr(wsLog.Cells(r, 3).Value & "")
            rowNum = CLng(wsLog.Cells(r, 4).Value)
            empName = CStr(wsLog.Cells(r, 5).Value & "")
            dosVal = wsLog.Cells(r, 6).Value
            If IsDate(dosVal) Then
                Dim key As String
                key = BuildKey(sheetName, rowNum, empName, CDate(dosVal))
                d(key) = True
            End If
        End If
    Next r

    Set LoadSyncedKeys = d
End Function

Private Sub LogRow(ByVal ws As Worksheet, ByVal sheetName As String, ByVal rowNum As Long, _
                   ByVal empName As String, ByVal dos As Date, ByVal action As String, _
                   ByVal supId As String, ByVal matchType As String, ByVal details As String)
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
    ws.Cells(nextRow, 8).Value = supId
    ws.Cells(nextRow, 9).Value = matchType
    ws.Cells(nextRow, 10).Value = details
End Sub

' ============================================================
' HTTP -- WinHttp primary, MSXML2 fallback
' ============================================================

Private Function HttpGet(ByVal sUrl As String) As String
    On Error Resume Next
    Dim oHTTP As Object
    Set oHTTP = CreateObject("WinHttp.WinHttpRequest.5.1")
    If Err.Number <> 0 Then Err.Clear: GoTo TryXml
    oHTTP.setTimeouts 10000, 10000, 10000, 20000
    oHTTP.Open "GET", sUrl, False
    oHTTP.setRequestHeader "apikey", SUPABASE_ANON_KEY
    oHTTP.setRequestHeader "Authorization", "Bearer " & SUPABASE_ANON_KEY
    oHTTP.setRequestHeader "Accept", "application/json"
    oHTTP.Send
    If Err.Number = 0 And oHTTP.Status = 200 Then
        HttpGet = oHTTP.responseText
        Exit Function
    End If
    Err.Clear

TryXml:
    Dim oXml As Object
    Set oXml = CreateObject("MSXML2.ServerXMLHTTP.6.0")
    If Err.Number <> 0 Then HttpGet = "": Exit Function
    oXml.Open "GET", sUrl, False
    oXml.setRequestHeader "apikey", SUPABASE_ANON_KEY
    oXml.setRequestHeader "Authorization", "Bearer " & SUPABASE_ANON_KEY
    oXml.setRequestHeader "Accept", "application/json"
    oXml.Send
    If Err.Number = 0 And oXml.Status = 200 Then HttpGet = oXml.responseText
End Function

Private Function HttpPatch(ByVal sUrl As String, ByVal body As String, ByRef respBody As String) As Long
    HttpPatch = 0
    On Error Resume Next
    Dim oHTTP As Object
    Set oHTTP = CreateObject("WinHttp.WinHttpRequest.5.1")
    If Err.Number <> 0 Then Err.Clear: GoTo TryXml
    oHTTP.setTimeouts 10000, 10000, 10000, 20000
    oHTTP.Open "PATCH", sUrl, False
    oHTTP.setRequestHeader "apikey", SUPABASE_ANON_KEY
    oHTTP.setRequestHeader "Authorization", "Bearer " & SUPABASE_ANON_KEY
    oHTTP.setRequestHeader "Content-Type", "application/json"
    oHTTP.setRequestHeader "Prefer", "return=minimal"
    oHTTP.Send body
    If Err.Number = 0 Then
        HttpPatch = oHTTP.Status
        respBody = oHTTP.responseText
        Exit Function
    End If
    Err.Clear

TryXml:
    Dim oXml As Object
    Set oXml = CreateObject("MSXML2.ServerXMLHTTP.6.0")
    If Err.Number <> 0 Then Exit Function
    oXml.Open "PATCH", sUrl, False
    oXml.setRequestHeader "apikey", SUPABASE_ANON_KEY
    oXml.setRequestHeader "Authorization", "Bearer " & SUPABASE_ANON_KEY
    oXml.setRequestHeader "Content-Type", "application/json"
    oXml.setRequestHeader "Prefer", "return=minimal"
    oXml.Send body
    If Err.Number = 0 Then
        HttpPatch = oXml.Status
        respBody = oXml.responseText
    End If
End Function

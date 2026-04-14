Attribute VB_Name = "Module3"
' ============================================================
' EVC Monthly New Hire Tracker — CSV Training Data Sync
' ============================================================
' Module3_Sync.bas
' HR Program Coordinator: Kyle Mahoney
' Emory Valley Center
'
' PURPOSE:
'   Pulls training completion data FROM a CSV source (training hub)
'   and writes results to the workbook's 12 monthly sheets
'   (January–December). Treats the CSV as the source of truth —
'   workbook cells get overwritten where the CSV has data.
'
' WORKBOOK STRUCTURE (read-only reference):
'   Sheets: Dashboard, Training Results, January–December (12 sheets),
'   Onboarding Report, Termination Report
'
'   Each monthly sheet (e.g., January):
'     Rows 5–29:   New Hires (25 slots, col A = # 1–25)
'       Target cols: L (CPR/FA), M (Med Cert), N (UKERU), O (Mealtime)
'       Match keys: C (Last Name), D (First Name)
'       Skip rows where col S (Status) = TERMINATED, RESIGNED, NCNS
'     Rows 34–58:  Transfers (25 slots, col A = # 1–25)
'       Target cols: K (UKERU), L (Mealtime)
'       Match keys: C (Last Name), D (First Name)
'       Skip rows where col P (Status) = QUIT, TERMINATED, RESIGNED, NCNS
'
' CSV SOURCE:
'   0  L NAME      -> Match against Col C (Last Name)
'   1  F NAME      -> Match against Col D (First Name)
'   3  CPR         -> Combine with FIRSTAID → Col L (CPR/FA)
'   4  FIRSTAID    -> Combine with CPR → Col L (CPR/FA)
'   5  MED_TRAIN   -> Col M (Med Cert)
'   7  Mealtime    -> Col O (NH) / Col L (TR)
'   9  Ukeru       -> Col N (NH) / Col K (TR)
'
' NAME MATCHING (priority order — stop at first hit):
'   1. Exact last + exact first → EXACT
'   2. Exact last + partial first (one contains other, min 3 chars) → EXACT
'   3. Exact last + name-part split (split CSV on spaces/quotes/parens) → EXACT
'   4. Exact last + nickname (from hardcoded dictionary) → NICKNAME
'   5. Exact last + fuzzy first (Dice > 0.7) → FUZZY
'   6. Fuzzy last (Dice > 0.85) + exact first → FUZZY
'
' VALUE TRANSLATION RULES:
'   CSV value               → Write         Comment
'   Valid date              → "Yes"         "Completed: MM/DD/YYYY"
'   Starts with "FAIL"      → "No"          "Failed (per source)"
'   Excusal code            → "N/A"         (none)
'     (FACILITIES, ELC, LLL, HR, RN, EI, ECF, NA, N/A)
'   Blank / empty           → skip          (do not overwrite)
'   Anything else           → skip          (do not overwrite)
'
'   CPR/FA special: pick the more recent of CPR vs FIRSTAID dates.
'   If one is blank and the other is a date, use the date.
'   If both are excusal/fail codes, prefer first non-blank.
'
' TECHNICAL REQUIREMENTS:
'   1. CSV download: try WinHttp first, fallback MSXML2
'   2. Timeouts: 10s connect, 10s send, 20s receive
'   3. Save to Environ("TEMP"), parse, clean up when done
'   4. CSV parser respects quoted fields (including commas inside quotes)
'   5. Skip first row (header)
'   6. Iterate all 12 monthly sheets; skip rows with blank Col C or skip-list status
'   7. Before writing: if same value + same comment already present, skip
'   8. Screen updating & calculation off during loop, restored in cleanup block
'   9. Show summary MsgBox at end
'   10. No external libraries beyond standard VBA, Scripting.Dictionary, WinHttp, MSXML2, ADODB.Stream
'
' GENERATED: 2026-04-14
' ============================================================

Option Explicit

' ============================================================
' CONFIGURATION — REPLACE THE URL WITH YOUR TRAINING HUB CSV
' ============================================================
Private Const SOURCE_CSV_URL As String = "https://REPLACE-WITH-TRAINING-HUB-CSV-URL"

' ============================================================
' ROW RANGE CONSTANTS
' ============================================================
Private Const NH_ROW_START As Long = 5
Private Const NH_ROW_END As Long = 29
Private Const TR_ROW_START As Long = 34
Private Const TR_ROW_END As Long = 58

' ============================================================
' COLUMN CONSTANTS (1-based)
' ============================================================
' New Hires
Private Const NH_LNAME As Long = 3      ' C
Private Const NH_FNAME As Long = 4      ' D
Private Const NH_CPRFA As Long = 12     ' L
Private Const NH_MEDCERT As Long = 13   ' M
Private Const NH_UKERU As Long = 14     ' N
Private Const NH_MEALTIME As Long = 15  ' O
Private Const NH_STATUS As Long = 19    ' S

' Transfers
Private Const TR_LNAME As Long = 3      ' C
Private Const TR_FNAME As Long = 4      ' D
Private Const TR_UKERU As Long = 11     ' K
Private Const TR_MEALTIME As Long = 12  ' L
Private Const TR_STATUS As Long = 16    ' P

' ============================================================
' CSV COLUMN INDICES (0-based in the CSV)
' ============================================================
Private Const CSV_LNAME As Long = 0
Private Const CSV_FNAME As Long = 1
Private Const CSV_CPR As Long = 3
Private Const CSV_FIRSTAID As Long = 4
Private Const CSV_MED_TRAIN As Long = 5
Private Const CSV_MEALTIME As Long = 7
Private Const CSV_UKERU As Long = 9

' ============================================================
' FUZZY MATCHING THRESHOLDS (Dice coefficient)
' ============================================================
Private Const FUZZY_FIRST_THRESHOLD As Double = 0.7
Private Const FUZZY_LAST_THRESHOLD As Double = 0.85

' ============================================================
' MODULE-LEVEL STATISTICS & NICKNAME MAP
' ============================================================
Private m_nhChecked As Long
Private m_trChecked As Long
Private m_matched As Long
Private m_nicknameMatches As Long
Private m_fuzzyMatches As Long
Private m_cellsUpdated As Long
Private m_nickGroups As Object  ' Dictionary: lowercase name -> Collection of group IDs

' ============================================================
' PUBLIC ENTRY POINT
' ============================================================

Public Sub SyncFromSource()
    Dim answer As VbMsgBoxResult

    Dim msg As String
    msg = "Sync training data from the training hub CSV?" & vbCrLf & vbCrLf & _
          "The CSV is treated as the source of truth." & vbCrLf & _
          "The following cells WILL be overwritten on every" & vbCrLf & _
          "monthly sheet (January–December):" & vbCrLf & vbCrLf & _
          "  New Hires (rows 5–29):" & vbCrLf & _
          "    L  CPR/FA" & vbCrLf & _
          "    M  Med Cert" & vbCrLf & _
          "    N  UKERU" & vbCrLf & _
          "    O  Mealtime" & vbCrLf & vbCrLf & _
          "  Transfers (rows 34–58):" & vbCrLf & _
          "    K  UKERU" & vbCrLf & _
          "    L  Mealtime" & vbCrLf & vbCrLf & _
          "Rows where the status column reads TERMINATED," & vbCrLf & _
          "RESIGNED, NCNS (or QUIT for transfers) are skipped." & vbCrLf & vbCrLf & _
          "Proceed?"

    answer = MsgBox(msg, vbYesNo + vbQuestion, "Training Data Sync")
    If answer <> vbYes Then Exit Sub

    ' Initialize stats
    m_nhChecked = 0
    m_trChecked = 0
    m_matched = 0
    m_nicknameMatches = 0
    m_fuzzyMatches = 0
    m_cellsUpdated = 0

    ' Download CSV
    Application.StatusBar = "Downloading training data from hub..."
    Dim csvText As String
    csvText = DownloadCsv(SOURCE_CSV_URL)
    If Len(csvText) < 10 Then
        MsgBox "Failed to download CSV from " & SOURCE_CSV_URL & ". Check the URL and network connection.", _
               vbExclamation, "Download Error"
        Application.StatusBar = False
        Exit Sub
    End If

    ' Parse CSV into Collection of String arrays (0-indexed, skip header row)
    Application.StatusBar = "Parsing CSV data..."
    Dim csvRows As Collection
    Set csvRows = ParseCsv(csvText)
    If csvRows.Count <= 1 Then
        MsgBox "CSV is empty or contains only the header row.", vbExclamation, "Parse Error"
        Application.StatusBar = False
        Exit Sub
    End If

    ' Build lookup indexes: byLast (last name -> Collection of records)
    ' and allRecords (for fuzzy last matching)
    Dim byLast As Object, allRecords As Collection
    Set byLast = CreateObject("Scripting.Dictionary")
    Set allRecords = New Collection

    ' Skip first row (header) and index the rest
    Dim i As Long
    For i = 2 To csvRows.Count
        Dim rec As Variant
        rec = csvRows(i)
        allRecords.Add rec

        Dim lname As String
        lname = LCase(Trim(CsvField(rec, CSV_LNAME)))
        If Len(lname) > 0 Then
            If Not byLast.Exists(lname) Then
                byLast.Add lname, New Collection
            End If
            byLast(lname).Add rec
        End If
    Next i

    ' Ensure nickname map is built
    EnsureNicknameMap

    ' Turn off screen updates and automatic calculation
    Application.ScreenUpdating = False
    Application.Calculation = xlCalculationManual

    On Error GoTo CleanupAndExit

    ' Process all 12 monthly sheets
    Dim months As Variant
    months = Array("January", "February", "March", "April", "May", "June", _
                   "July", "August", "September", "October", "November", "December")

    Dim m As Long
    For m = 0 To 11
        Dim wsMonth As Worksheet
        Set wsMonth = Nothing
        On Error Resume Next
        Set wsMonth = ThisWorkbook.Worksheets(CStr(months(m)))
        On Error GoTo CleanupAndExit

        If Not wsMonth Is Nothing Then
            Application.StatusBar = "Processing " & months(m) & "..."
            ProcessMonthlySheet wsMonth, byLast, allRecords
        End If
    Next m

CleanupAndExit:
    ' Restore screen updates and automatic calculation
    Application.Calculation = xlCalculationAutomatic
    Application.ScreenUpdating = True
    Application.StatusBar = False

    ' Show summary
    Dim summary As String
    summary = "Training data sync complete." & vbCrLf & vbCrLf & _
              "  NH rows checked:   " & m_nhChecked & vbCrLf & _
              "  TR rows checked:   " & m_trChecked & vbCrLf & _
              "  Total matched:     " & m_matched & vbCrLf & _
              "  Nickname matches:  " & m_nicknameMatches & vbCrLf & _
              "  Fuzzy matches:     " & m_fuzzyMatches & vbCrLf & _
              "  Cells updated:     " & m_cellsUpdated
    MsgBox summary, vbInformation, "Sync Complete"
End Sub

' ============================================================
' MONTHLY SHEET PROCESSING
' ============================================================

Private Sub ProcessMonthlySheet(ByVal ws As Worksheet, ByVal byLast As Object, ByVal allRecords As Collection)
    Dim r As Long
    Dim firstName As String, lastName As String, status As String
    Dim matchType As String, rec As Variant
    Dim wv As String, ct As String

    ' ===== NEW HIRES (rows 5–29) =====
    For r = NH_ROW_START To NH_ROW_END
        lastName = Trim(CStr(ws.Cells(r, NH_LNAME).Value & ""))
        If Len(lastName) = 0 Then GoTo NextNH

        firstName = Trim(CStr(ws.Cells(r, NH_FNAME).Value & ""))
        status = UCase(Trim(CStr(ws.Cells(r, NH_STATUS).Value & "")))

        ' Skip if status is in the skip list
        Select Case status
            Case "TERMINATED", "RESIGNED", "NCNS"
                GoTo NextNH
        End Select

        m_nhChecked = m_nhChecked + 1

        ' Match against CSV
        rec = MatchCsvRow(byLast, allRecords, firstName, lastName, matchType)
        If IsEmpty(rec) Or VarType(rec) = vbEmpty Then GoTo NextNH

        m_matched = m_matched + 1
        If matchType = "NICKNAME" Then m_nicknameMatches = m_nicknameMatches + 1
        If matchType = "FUZZY" Then m_fuzzyMatches = m_fuzzyMatches + 1

        ' Write CPR/FA (combine CPR and FIRSTAID)
        If CombineCprFa(CsvField(rec, CSV_CPR), CsvField(rec, CSV_FIRSTAID), wv, ct) Then
            WriteCell ws.Cells(r, NH_CPRFA), wv, ct
        End If

        ' Write Med Cert
        If TranslateCsvValue(CsvField(rec, CSV_MED_TRAIN), wv, ct) Then
            WriteCell ws.Cells(r, NH_MEDCERT), wv, ct
        End If

        ' Write UKERU
        If TranslateCsvValue(CsvField(rec, CSV_UKERU), wv, ct) Then
            WriteCell ws.Cells(r, NH_UKERU), wv, ct
        End If

        ' Write Mealtime
        If TranslateCsvValue(CsvField(rec, CSV_MEALTIME), wv, ct) Then
            WriteCell ws.Cells(r, NH_MEALTIME), wv, ct
        End If

NextNH:
    Next r

    ' ===== TRANSFERS (rows 34–58) =====
    For r = TR_ROW_START To TR_ROW_END
        lastName = Trim(CStr(ws.Cells(r, TR_LNAME).Value & ""))
        If Len(lastName) = 0 Then GoTo NextTR

        firstName = Trim(CStr(ws.Cells(r, TR_FNAME).Value & ""))
        status = UCase(Trim(CStr(ws.Cells(r, TR_STATUS).Value & "")))

        ' Skip if status is in the skip list
        Select Case status
            Case "QUIT", "TERMINATED", "RESIGNED", "NCNS"
                GoTo NextTR
        End Select

        m_trChecked = m_trChecked + 1

        ' Match against CSV
        rec = MatchCsvRow(byLast, allRecords, firstName, lastName, matchType)
        If IsEmpty(rec) Or VarType(rec) = vbEmpty Then GoTo NextTR

        m_matched = m_matched + 1
        If matchType = "NICKNAME" Then m_nicknameMatches = m_nicknameMatches + 1
        If matchType = "FUZZY" Then m_fuzzyMatches = m_fuzzyMatches + 1

        ' Write UKERU
        If TranslateCsvValue(CsvField(rec, CSV_UKERU), wv, ct) Then
            WriteCell ws.Cells(r, TR_UKERU), wv, ct
        End If

        ' Write Mealtime
        If TranslateCsvValue(CsvField(rec, CSV_MEALTIME), wv, ct) Then
            WriteCell ws.Cells(r, TR_MEALTIME), wv, ct
        End If

NextTR:
    Next r
End Sub

' ============================================================
' NAME MATCHING (priority order)
' ============================================================

Private Function MatchCsvRow(ByVal byLast As Object, ByVal allRecords As Collection, _
                              ByVal firstName As String, ByVal lastName As String, _
                              ByRef matchType As String) As Variant
    Dim lLower As String, fLower As String
    lLower = LCase(Trim(lastName))
    fLower = LCase(Trim(firstName))

    If Len(lLower) = 0 Then Exit Function

    matchType = ""
    Dim rec As Variant

    ' 1. Exact last + exact first
    If byLast.Exists(lLower) Then
        For Each rec In byLast(lLower)
            If LCase(Trim(CsvField(rec, CSV_FNAME))) = fLower Then
                matchType = "EXACT"
                MatchCsvRow = rec
                Exit Function
            End If
        Next rec
    End If

    ' 2. Exact last + partial first (one contains the other, min 3 chars)
    If byLast.Exists(lLower) And Len(fLower) >= 3 Then
        For Each rec In byLast(lLower)
            Dim csvFn As String
            csvFn = LCase(Trim(CsvField(rec, CSV_FNAME)))
            If Len(csvFn) >= 3 Then
                If (InStr(1, csvFn, fLower, vbBinaryCompare) > 0) Or _
                   (InStr(1, fLower, csvFn, vbBinaryCompare) > 0) Then
                    matchType = "EXACT"
                    MatchCsvRow = rec
                    Exit Function
                End If
            End If
        Next rec
    End If

    ' 3. Exact last + name-part split (CSV name split on spaces, quotes, parens)
    If byLast.Exists(lLower) Then
        For Each rec In byLast(lLower)
            If NamePartMatch(CStr(CsvField(rec, CSV_FNAME)), firstName) Then
                matchType = "EXACT"
                MatchCsvRow = rec
                Exit Function
            End If
        Next rec
    End If

    ' 4. Exact last + nickname
    If byLast.Exists(lLower) Then
        For Each rec In byLast(lLower)
            If NicknameMatch(CStr(CsvField(rec, CSV_FNAME)), firstName) Then
                matchType = "NICKNAME"
                MatchCsvRow = rec
                Exit Function
            End If
        Next rec
    End If

    ' 5. Exact last + fuzzy first (Dice > 0.7)
    If byLast.Exists(lLower) Then
        For Each rec In byLast(lLower)
            If DiceCoefficient(LCase(Trim(CsvField(rec, CSV_FNAME))), fLower) > FUZZY_FIRST_THRESHOLD Then
                matchType = "FUZZY"
                MatchCsvRow = rec
                Exit Function
            End If
        Next rec
    End If

    ' 6. Fuzzy last (Dice > 0.85) + exact first
    Dim recLast As String, recFirst As String
    For Each rec In allRecords
        recLast = LCase(Trim(CsvField(rec, CSV_LNAME)))
        recFirst = LCase(Trim(CsvField(rec, CSV_FNAME)))
        If recFirst = fLower And DiceCoefficient(recLast, lLower) > FUZZY_LAST_THRESHOLD Then
            matchType = "FUZZY"
            MatchCsvRow = rec
            Exit Function
        End If
    Next rec
End Function

' ============================================================
' NAME PART MATCHING (split on spaces, quotes, parens)
' ============================================================

Private Function NamePartMatch(ByVal csvName As String, ByVal wbName As String) As Boolean
    Dim parts As Variant
    parts = SplitOnDelimiters(csvName, " """ & "()")

    Dim p As Variant, pp As String, wbNormalized As String
    wbNormalized = LCase(Trim(wbName))

    For Each p In parts
        pp = LCase(Trim(CStr(p)))
        If Len(pp) >= 2 And pp = wbNormalized Then
            NamePartMatch = True
            Exit Function
        End If
    Next p
End Function

Private Function SplitOnDelimiters(ByVal s As String, ByVal delims As String) As Variant
    Dim i As Long, ch As String
    Dim buf As String, parts As New Collection

    For i = 1 To Len(s)
        ch = Mid(s, i, 1)
        If InStr(delims, ch) > 0 Then
            If Len(buf) > 0 Then parts.Add buf
            buf = ""
        Else
            buf = buf & ch
        End If
    Next i

    If Len(buf) > 0 Then parts.Add buf

    Dim arr() As String
    If parts.Count = 0 Then
        SplitOnDelimiters = Array()
    Else
        ReDim arr(0 To parts.Count - 1)
        Dim j As Long
        For j = 1 To parts.Count
            arr(j - 1) = parts(j)
        Next j
        SplitOnDelimiters = arr
    End If
End Function

' ============================================================
' NICKNAME MATCHING
' ============================================================

Private Sub EnsureNicknameMap()
    If Not m_nickGroups Is Nothing Then Exit Sub

    Set m_nickGroups = CreateObject("Scripting.Dictionary")
    m_nickGroups.CompareMode = vbTextCompare

    Dim gid As Long
    Dim gidDeborah As Long, gidKatherine As Long

    ' Standard nickname groups
    gid = gid + 1: AddGroup gid, Array("Mike", "Michael", "Micheal")
    gid = gid + 1: AddGroup gid, Array("Bob", "Robert", "Bobby", "Austin")
    gid = gid + 1: AddGroup gid, Array("Bill", "William", "Billy")
    gid = gid + 1: AddGroup gid, Array("Jim", "James", "Jimmy")
    gid = gid + 1: AddGroup gid, Array("Joe", "Joseph", "Joey")
    gid = gid + 1: AddGroup gid, Array("Tom", "Thomas", "Tommy")
    gid = gid + 1: AddGroup gid, Array("Dick", "Richard", "Rick", "Rich", "Aaron")
    gid = gid + 1: AddGroup gid, Array("Dan", "Daniel", "Danny")
    gid = gid + 1: AddGroup gid, Array("Dave", "David")
    gid = gid + 1: AddGroup gid, Array("Steve", "Steven", "Stephen")
    gid = gid + 1: AddGroup gid, Array("Matt", "Matthew", "Mathew")
    gid = gid + 1: AddGroup gid, Array("Chris", "Christopher", "Christian")
    gid = gid + 1: AddGroup gid, Array("Pat", "Patricia", "Patrick", "Patty")
    gid = gid + 1: AddGroup gid, Array("Jen", "Jennifer", "Jenny")
    gid = gid + 1: AddGroup gid, Array("Liz", "Elizabeth", "Beth", "Betsy")
    gid = gid + 1: gidKatherine = gid: AddGroup gid, Array("Kate", "Katherine", "Kathryn", "Kathy", "Katie")
    gid = gid + 1: AddGroup gid, Array("Sue", "Susan", "Susie")
    gid = gid + 1: AddGroup gid, Array("Meg", "Megan", "Meghan", "Margaret")
    gid = gid + 1: AddGroup gid, Array("Sam", "Samantha", "Samuel", "Hope")
    gid = gid + 1: AddGroup gid, Array("Tony", "Anthony", "Antonio")
    gid = gid + 1: AddGroup gid, Array("Nick", "Nicholas")
    gid = gid + 1: AddGroup gid, Array("Alex", "Alexander", "Alexandra", "Alexis")
    gid = gid + 1: AddGroup gid, Array("Ed", "Edward", "Eddie", "Edgar")
    gid = gid + 1: AddGroup gid, Array("Josh", "Joshua")
    gid = gid + 1: AddGroup gid, Array("Jon", "Jonathan", "Jonathon")
    gid = gid + 1: AddGroup gid, Array("Tim", "Timothy")
    gid = gid + 1: AddGroup gid, Array("Larry", "Lawrence")
    gid = gid + 1: AddGroup gid, Array("Cindy", "Cynthia")
    gid = gid + 1: AddGroup gid, Array("Sandy", "Sandra", "Sandi")
    gid = gid + 1: AddGroup gid, Array("Barb", "Barbara")
    gid = gid + 1: gidDeborah = gid: AddGroup gid, Array("Deb", "Deborah", "Debra", "Debbie")
    gid = gid + 1: AddGroup gid, Array("Don", "Donald", "Donny")
    gid = gid + 1: AddGroup gid, Array("Jeff", "Jeffrey", "Jeffery")
    gid = gid + 1: AddGroup gid, Array("Ted", "Theodore")
    gid = gid + 1: AddGroup gid, Array("Ray", "Raymond")
    gid = gid + 1: AddGroup gid, Array("Ron", "Ronald", "Ronnie")
    gid = gid + 1: AddGroup gid, Array("Phil", "Phillip", "Philip")
    gid = gid + 1: AddGroup gid, Array("Kim", "Kimberly")
    gid = gid + 1: AddGroup gid, Array("Mel", "Melanie")
    gid = gid + 1: AddGroup gid, Array("Cassie", "Cassandra")

    ' EVC-specific groups
    gid = gid + 1: AddGroup gid, Array("Frankie", "Niyonyishu")
    gid = gid + 1: AddGroup gid, Array("Jamie", "Everette")
    gid = gid + 1: AddGroup gid, Array("Elise", "Elisete")
    gid = gid + 1: AddGroup gid, Array("Leah", "Raeleah")
    gid = gid + 1: AddGroup gid, Array("Abbi", "Abbigayle", "Abigail", "Abbey")
    gid = gid + 1: AddGroup gid, Array("Zachary", "Zachery")
    gid = gid + 1: AddGroup gid, Array("Annette", "Carol")
    gid = gid + 1: AddGroup gid, Array("Lani", "Iolani")
    gid = gid + 1: AddGroup gid, Array("Bimbor", "Abimbola")
    gid = gid + 1: AddGroup gid, Array("Madilynn", "Madison")
    gid = gid + 1: AddGroup gid, Array("Nichole", "Randi")
    gid = gid + 1: AddGroup gid, Array("Ravyn", "Jonni")
    gid = gid + 1: AddGroup gid, Array("Rasshad", "Ikee")
    gid = gid + 1: AddGroup gid, Array("Nikki", "Heather")

    ' Kay belongs to multiple groups (Deborah, Katherine)
    AddNickToGroup "Kay", gidDeborah
    AddNickToGroup "Kay", gidKatherine
End Sub

Private Sub AddGroup(ByVal groupId As Long, ByVal names As Variant)
    Dim i As Long
    For i = LBound(names) To UBound(names)
        AddNickToGroup CStr(names(i)), groupId
    Next i
End Sub

Private Sub AddNickToGroup(ByVal name As String, ByVal groupId As Long)
    Dim key As String
    key = LCase(Trim(name))
    If Len(key) = 0 Then Exit Sub

    Dim c As Collection
    If m_nickGroups.Exists(key) Then
        Set c = m_nickGroups(key)
    Else
        Set c = New Collection
        m_nickGroups.Add key, c
    End If

    ' Avoid duplicate group IDs
    Dim x As Variant
    For Each x In c
        If x = groupId Then Exit Sub
    Next x
    c.Add groupId
End Sub

Private Function NicknameMatch(ByVal a As String, ByVal b As String) As Boolean
    Dim la As String, lb As String
    la = LCase(Trim(a))
    lb = LCase(Trim(b))

    If Len(la) = 0 Or Len(lb) = 0 Then Exit Function
    If Not m_nickGroups.Exists(la) Then Exit Function
    If Not m_nickGroups.Exists(lb) Then Exit Function

    Dim gA As Collection, gB As Collection
    Set gA = m_nickGroups(la)
    Set gB = m_nickGroups(lb)

    Dim x As Variant, y As Variant
    For Each x In gA
        For Each y In gB
            If x = y Then
                NicknameMatch = True
                Exit Function
            End If
        Next y
    Next x
End Function

' ============================================================
' FUZZY MATCHING (Dice Coefficient)
' ============================================================

Private Function DiceCoefficient(ByVal a As String, ByVal b As String) As Double
    If Len(a) < 2 Or Len(b) < 2 Then
        DiceCoefficient = 0
        Exit Function
    End If

    Dim dA As Object, dB As Object
    Set dA = CreateObject("Scripting.Dictionary")
    Set dB = CreateObject("Scripting.Dictionary")

    ' Build bigram counts for a
    Dim i As Long, bg As String
    For i = 1 To Len(a) - 1
        bg = Mid(a, i, 2)
        If dA.Exists(bg) Then
            dA(bg) = dA(bg) + 1
        Else
            dA.Add bg, 1
        End If
    Next i

    ' Build bigram counts for b
    For i = 1 To Len(b) - 1
        bg = Mid(b, i, 2)
        If dB.Exists(bg) Then
            dB(bg) = dB(bg) + 1
        Else
            dB.Add bg, 1
        End If
    Next i

    ' Count intersection (min counts)
    Dim inter As Long, k As Variant
    inter = 0
    For Each k In dA.Keys
        If dB.Exists(k) Then
            If dA(k) < dB(k) Then
                inter = inter + dA(k)
            Else
                inter = inter + dB(k)
            End If
        End If
    Next k

    ' Dice = 2 * intersection / (total bigrams)
    Dim total As Long
    total = (Len(a) - 1) + (Len(b) - 1)

    If total = 0 Then
        DiceCoefficient = 0
    Else
        DiceCoefficient = (2# * inter) / total
    End If
End Function

' ============================================================
' VALUE TRANSLATION
' ============================================================

Private Function TranslateCsvValue(ByVal raw As String, ByRef writeVal As String, ByRef commentText As String) As Boolean
    Dim s As String
    s = Trim(raw)

    ' Empty — skip
    If Len(s) = 0 Then
        TranslateCsvValue = False
        Exit Function
    End If

    Dim up As String
    up = UCase(s)

    ' Excusal/N/A codes
    Select Case up
        Case "FACILITIES", "ELC", "LLL", "HR", "RN", "EI", "ECF", "NA", "N/A"
            writeVal = "N/A"
            commentText = ""
            TranslateCsvValue = True
            Exit Function
    End Select

    ' FAIL prefix
    If Left(up, 4) = "FAIL" Then
        writeVal = "No"
        commentText = "Failed (per source)"
        TranslateCsvValue = True
        Exit Function
    End If

    ' Try to parse as date
    Dim d As Date
    If TryParseDate(s, d) Then
        writeVal = "Yes"
        commentText = "Completed: " & Format(d, "mm/dd/yyyy")
        TranslateCsvValue = True
        Exit Function
    End If

    ' Unknown value — skip
    TranslateCsvValue = False
End Function

Private Function TryParseDate(ByVal s As String, ByRef d As Date) As Boolean
    On Error Resume Next
    d = CDate(s)
    If Err.Number = 0 And IsDate(s) Then
        TryParseDate = True
    Else
        TryParseDate = False
    End If
    Err.Clear
    On Error GoTo 0
End Function

Private Function CombineCprFa(ByVal cprVal As String, ByVal faVal As String, _
                              ByRef writeVal As String, ByRef commentText As String) As Boolean
    Dim cprDate As Date, faDate As Date
    Dim cprHasDate As Boolean, faHasDate As Boolean

    cprHasDate = TryParseDate(cprVal, cprDate)
    faHasDate = TryParseDate(faVal, faDate)

    ' Both are dates — pick the more recent
    If cprHasDate And faHasDate Then
        Dim newer As Date
        If cprDate >= faDate Then newer = cprDate Else newer = faDate
        writeVal = "Yes"
        commentText = "Completed: " & Format(newer, "mm/dd/yyyy")
        CombineCprFa = True
        Exit Function
    End If

    ' Only CPR is a date
    If cprHasDate Then
        writeVal = "Yes"
        commentText = "Completed: " & Format(cprDate, "mm/dd/yyyy")
        CombineCprFa = True
        Exit Function
    End If

    ' Only FIRSTAID is a date
    If faHasDate Then
        writeVal = "Yes"
        commentText = "Completed: " & Format(faDate, "mm/dd/yyyy")
        CombineCprFa = True
        Exit Function
    End If

    ' No dates; try translating as single value, prefer CPR
    Dim wv As String, ct As String
    If Len(Trim(cprVal)) > 0 Then
        If TranslateCsvValue(cprVal, wv, ct) Then
            writeVal = wv
            commentText = ct
            CombineCprFa = True
            Exit Function
        End If
    End If

    If Len(Trim(faVal)) > 0 Then
        If TranslateCsvValue(faVal, wv, ct) Then
            writeVal = wv
            commentText = ct
            CombineCprFa = True
            Exit Function
        End If
    End If
End Function

' ============================================================
' CELL WRITING (with re-run skip optimization)
' ============================================================

Private Sub WriteCell(ByVal cell As Range, ByVal writeVal As String, ByVal commentText As String)
    Dim curVal As String
    curVal = CStr(cell.Value & "")

    ' Check if already has the same value + comment
    Dim curComment As String
    If Not cell.Comment Is Nothing Then
        curComment = cell.Comment.Text
    End If

    ' Skip if value matches and comment matches (or both empty)
    If curVal = writeVal Then
        If Len(commentText) = 0 Then
            If Len(curComment) = 0 Then Exit Sub  ' Same value, no comment needed, none exists
        Else
            If Len(curComment) > 0 Then
                If InStr(1, curComment, commentText, vbBinaryCompare) > 0 Then
                    Exit Sub  ' Same value, comment present and contains expected text
                End If
            End If
        End If
    End If

    ' Delete old comment if any
    If Not cell.Comment Is Nothing Then
        cell.Comment.Delete
    End If

    ' Write new value
    cell.Value = writeVal

    ' Add new comment if any
    If Len(commentText) > 0 Then
        cell.AddComment commentText
    End If

    m_cellsUpdated = m_cellsUpdated + 1
End Sub

' ============================================================
' CSV PARSING (handles quoted fields with embedded commas)
' ============================================================

Private Function ParseCsv(ByVal csvText As String) As Collection
    Dim rows As New Collection
    Dim fields As Collection
    Set fields = New Collection
    Dim field As String
    field = ""
    Dim inQuote As Boolean
    inQuote = False

    Dim i As Long, n As Long
    n = Len(csvText)
    i = 1

    Do While i <= n
        Dim ch As String
        ch = Mid(csvText, i, 1)

        If inQuote Then
            If ch = """" Then
                ' Check for escaped quote ("")
                If i < n And Mid(csvText, i + 1, 1) = """" Then
                    field = field & """"
                    i = i + 2
                Else
                    ' End of quoted field
                    inQuote = False
                    i = i + 1
                End If
            Else
                field = field & ch
                i = i + 1
            End If
        Else
            Select Case ch
                Case """"
                    inQuote = True
                    i = i + 1
                Case ","
                    fields.Add field
                    field = ""
                    i = i + 1
                Case vbLf
                    fields.Add field
                    field = ""
                    If fields.Count > 0 Then
                        rows.Add CollectionToArray(fields)
                    End If
                    Set fields = New Collection
                    i = i + 1
                Case vbCr
                    ' Skip carriage return
                    i = i + 1
                Case Else
                    field = field & ch
                    i = i + 1
            End Select
        End If
    Loop

    ' Handle last field/row
    If Len(field) > 0 Or fields.Count > 0 Then
        fields.Add field
        rows.Add CollectionToArray(fields)
    End If

    Set ParseCsv = rows
End Function

Private Function CollectionToArray(ByVal c As Collection) As Variant
    If c.Count = 0 Then
        CollectionToArray = Array()
        Exit Function
    End If

    Dim arr() As String
    ReDim arr(0 To c.Count - 1)
    Dim j As Long
    For j = 1 To c.Count
        arr(j - 1) = CStr(c(j))
    Next j
    CollectionToArray = arr
End Function

Private Function CsvField(ByVal rec As Variant, ByVal idx As Long) As String
    On Error Resume Next
    Dim lb As Long, ub As Long
    lb = LBound(rec)
    ub = UBound(rec)
    If idx >= lb And idx <= ub Then
        CsvField = CStr(rec(idx))
    Else
        CsvField = ""
    End If
    On Error GoTo 0
End Function

' ============================================================
' CSV DOWNLOAD (WinHttp primary, MSXML2 fallback)
' ============================================================

Private Function DownloadCsv(ByVal url As String) As String
    Dim responseText As String

    ' Try WinHttp first
    On Error Resume Next
    Dim oHTTP As Object
    Set oHTTP = CreateObject("WinHttp.WinHttpRequest.5.1")
    If Err.Number = 0 And Not oHTTP Is Nothing Then
        Err.Clear
        oHTTP.setTimeouts 10000, 10000, 10000, 20000
        oHTTP.Open "GET", url, False
        oHTTP.setRequestHeader "Accept", "text/csv, text/plain, */*"
        oHTTP.Send
        If Err.Number = 0 And oHTTP.Status = 200 Then
            responseText = oHTTP.responseText
            On Error GoTo 0
            DownloadCsv = responseText
            Exit Function
        End If
        Err.Clear
    End If
    On Error GoTo 0

    ' Fall back to MSXML2
    On Error Resume Next
    Dim oXml As Object
    Set oXml = CreateObject("MSXML2.ServerXMLHTTP.6.0")
    If Err.Number = 0 And Not oXml Is Nothing Then
        Err.Clear
        oXml.Open "GET", url, False
        oXml.setRequestHeader "Accept", "text/csv, text/plain, */*"
        oXml.Send
        If Err.Number = 0 And oXml.Status = 200 Then
            responseText = oXml.responseText
            On Error GoTo 0
            DownloadCsv = responseText
            Exit Function
        End If
    End If
    On Error GoTo 0

    DownloadCsv = ""
End Function

' ============================================================
' END MODULE3_SYNC.BAS
' ============================================================

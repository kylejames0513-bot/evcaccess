Attribute VB_Name = "Module1"
' ============================================================
' EVC Supabase Sync -- Pull Training Dates
' ============================================================
' Module3 -- New Hire Transfer Tracker
' HR Program Coordinator: Kyle Mahoney
' Emory Valley Center
' ============================================================
'
' PURPOSE:
'   Pulls training completion dates FROM Supabase
'   and updates the New Hire Tracker monthly sheets.
'   Supabase is the source of truth (migrated from Google Sheets).
'
' SYNCS (overlapping trainings only):
'   Supabase            ->  New Hire Tracker
'   CPR + FIRSTAID      ->  CPR/FA      (NH col 12)
'   MED_TRAIN           ->  Med Cert    (NH col 13)
'   Ukeru               ->  UKERU       (NH col 14, TR col 11)
'   Mealtime            ->  Mealtime    (NH col 15, TR col 12)
'
' NAME MATCHING (same logic as Access module):
'   1. Exact last + exact first
'   2. Exact last + partial first (contains match)
'   3. Exact last + name part match
'   4. Exact last + nickname match (from Supabase nicknames table)
'   5. Exact last + fuzzy first (Dice coefficient > 0.7)
'   6. Fuzzy last (> 0.85) + exact first
'
' RULES:
'   - Date in Supabase       -> "Yes" + comment with date
'   - Excusal record         -> "N/A"
'   - Blank in Supabase      -> skip (no data to sync)
'   - Overwrites existing cell (Supabase = source of truth)
'   - Skips terminated/resigned/NCNS employees
'
' SETUP:
'   1. Paste this into a new module (Module3)
'   2. Set SUPABASE_URL and SUPABASE_ANON_KEY below
'   3. Add a button on Dashboard that calls SyncFromSupabase
'
' ============================================================

Option Explicit

' ============================================================
' CONFIGURATION
' ============================================================
Private Const SUPABASE_URL As String = "YOUR_SUPABASE_URL"
Private Const SUPABASE_ANON_KEY As String = "YOUR_SUPABASE_ANON_KEY"

' New Hire column indices (1-based, rows 5-54)
Private Const NH_LNAME As Long = 3
Private Const NH_FNAME As Long = 4
Private Const NH_STATUS As Long = 19
Private Const NH_CPRFA As Long = 12
Private Const NH_MEDCERT As Long = 13
Private Const NH_UKERU As Long = 14
Private Const NH_MEALTIME As Long = 15

' Transfer column indices (1-based, rows 59-108)
Private Const TR_LNAME As Long = 3
Private Const TR_FNAME As Long = 4
Private Const TR_STATUS As Long = 16
Private Const TR_UKERU As Long = 11
Private Const TR_MEALTIME As Long = 12

' Module-level nickname dictionary (loaded once per sync)
Private m_nickMap As Object


' ============================================================
' NICKNAMES -- Fetched from Supabase with hardcoded fallback
' ============================================================
Private Function GetNicknames() As Object
    Dim d As Object
    Set d = CreateObject("Scripting.Dictionary")
    d.CompareMode = vbTextCompare

    ' Try to fetch from Supabase nicknames table
    Dim jsonData As String
    jsonData = FetchFromSupabase(SUPABASE_URL & "/rest/v1/nicknames?select=name,alias")

    If Len(jsonData) > 2 Then
        Dim sc As Object
        Set sc = CreateObject("ScriptControl")
        sc.Language = "JScript"
        sc.AddCode "function getLength(arr) { return arr.length; }"
        sc.AddCode "function getItem(arr, i) { return arr[i]; }"
        sc.AddCode "function getValue(obj, key) { var v = obj[key]; return (v === null || v === undefined) ? '' : String(v); }"

        Dim jsonArray As Object
        Set jsonArray = sc.Eval("(" & jsonData & ")")

        Dim arrLen As Long
        arrLen = sc.Run("getLength", jsonArray)

        Dim i As Long
        For i = 0 To arrLen - 1
            Dim item As Object
            Set item = sc.Run("getItem", jsonArray, i)
            Dim nickName As String, nickAlias As String
            nickName = LCase(sc.Run("getValue", item, "name"))
            nickAlias = LCase(sc.Run("getValue", item, "alias"))

            If Len(nickName) > 0 And Len(nickAlias) > 0 Then
                If d.Exists(nickName) Then
                    d(nickName) = d(nickName) & "," & nickAlias
                Else
                    d(nickName) = nickAlias
                End If
            End If
        Next i
        Set sc = Nothing
    Else
        ' Fallback: hardcoded core nicknames if Supabase is unreachable
        d("mike") = "michael,micheal": d("michael") = "mike": d("micheal") = "mike"
        d("bob") = "robert": d("robert") = "bob,bobby": d("bobby") = "robert,bob"
        d("bill") = "william": d("william") = "bill,will,billy": d("will") = "william"
        d("jim") = "james": d("james") = "jim,jimmy": d("jimmy") = "james"
        d("joe") = "joseph": d("joseph") = "joe,joey"
        d("tom") = "thomas": d("thomas") = "tom,tommy"
        d("chris") = "christopher,christian": d("christopher") = "chris": d("christian") = "chris"
        d("frankie") = "niyonyishu": d("niyonyishu") = "frankie"
        d("jamie") = "everette": d("everette") = "jamie"
    End If

    Set GetNicknames = d
End Function


' ============================================================
' Build all names to try (input name + its nicknames)
' ============================================================
Private Function GetNamesToTry(ByVal inputFirst As String) As Variant
    Dim names() As String
    Dim nameCount As Long
    nameCount = 0
    ReDim names(0)
    names(0) = LCase(Trim(inputFirst))

    If m_nickMap.Exists(names(0)) Then
        Dim nicks As Variant, nn As Long
        nicks = Split(m_nickMap(names(0)), ",")
        For nn = 0 To UBound(nicks)
            nameCount = nameCount + 1
            ReDim Preserve names(nameCount)
            names(nameCount) = Trim(nicks(nn))
        Next nn
    End If

    GetNamesToTry = names
End Function


' ============================================================
' Clean a first name field (strip quotes, parens, extra spaces)
' ============================================================
Private Function CleanFirstName(ByVal rawFirst As String) As String
    Dim s As String
    s = LCase(Trim(rawFirst))
    s = Replace(Replace(Replace(Replace(s, """", " "), "'", " "), "(", " "), ")", " ")
    Do While InStr(s, "  ") > 0: s = Replace(s, "  ", " "): Loop
    CleanFirstName = Trim(s)
End Function


' ============================================================
' MAIN: Sync training dates from Supabase
' ============================================================
Public Sub SyncFromSupabase()
    Dim answer As VbMsgBoxResult
    answer = MsgBox("Pull training dates from Supabase?" & vbCrLf & vbCrLf & _
                    "This will update these columns on all monthly tabs:" & vbCrLf & _
                    "  - CPR/FA" & vbCrLf & _
                    "  - Med Cert" & vbCrLf & _
                    "  - UKERU" & vbCrLf & _
                    "  - Mealtime" & vbCrLf & vbCrLf & _
                    "Supabase is the source of truth -- existing values will be overwritten.", _
                    vbYesNo + vbQuestion, "Sync Training Dates")
    If answer <> vbYes Then Exit Sub

    ' Load nickname dictionary once
    Set m_nickMap = GetNicknames()

    ' Fetch compliance data from Supabase
    Application.StatusBar = "Fetching training data from Supabase..."

    ' Fetch employee compliance view with relevant training types
    Dim jsonData As String
    jsonData = FetchFromSupabase(SUPABASE_URL & _
        "/rest/v1/employee_compliance?select=first_name,last_name,training_name,completion_date,excusal_reason,status")

    If Len(jsonData) < 3 Then
        MsgBox "Could not fetch from Supabase." & vbCrLf & _
               "Check your internet connection and try again.", _
               vbExclamation, "Fetch Failed"
        Application.StatusBar = False
        Set m_nickMap = Nothing
        Exit Sub
    End If

    ' Parse JSON into collection
    Application.StatusBar = "Parsing training data..."
    Dim records As Collection
    Set records = ParseComplianceJSON(jsonData)

    If records.Count = 0 Then
        MsgBox "No data found.", vbExclamation, "Sync"
        Application.StatusBar = False
        Set m_nickMap = Nothing
        Exit Sub
    End If

    ' Process all monthly tabs
    Application.ScreenUpdating = False
    Application.Calculation = xlCalculationManual

    Dim months As Variant
    months = Array("January", "February", "March", "April", "May", "June", _
                   "July", "August", "September", "October", "November", "December")

    Dim totalMatched As Long, totalUpdated As Long
    Dim totalNHChecked As Long, totalTRChecked As Long
    Dim totalNickMatched As Long, totalFuzzyMatched As Long
    Dim m As Long, r As Long
    Dim wsMonth As Worksheet

    For m = LBound(months) To UBound(months)
        Set wsMonth = Nothing
        On Error Resume Next
        Set wsMonth = ThisWorkbook.Worksheets(CStr(months(m)))
        On Error GoTo 0
        If wsMonth Is Nothing Then GoTo NextMonth

        Application.StatusBar = "Syncing " & CStr(months(m)) & "..."

        ' NEW HIRES (rows 5-54)
        For r = 5 To 54
            Dim nhLast As String, nhFirst As String, nhStat As String
            nhLast = Trim(wsMonth.Cells(r, NH_LNAME).Value & "")
            nhFirst = Trim(wsMonth.Cells(r, NH_FNAME).Value & "")
            nhStat = UCase(Trim(wsMonth.Cells(r, NH_STATUS).Value & ""))
            If nhLast = "" Then GoTo NextNH
            If nhStat = "TERMINATED" Or nhStat = "NCNS" Or nhStat = "RESIGNED" Then GoTo NextNH

            totalNHChecked = totalNHChecked + 1
            Dim matchResult As Variant
            matchResult = FindInRecords(records, nhLast, nhFirst)
            If IsEmpty(matchResult) Then GoTo NextNH

            Dim empRecords As Collection, matchType As String
            Set empRecords = matchResult(0)
            matchType = CStr(matchResult(1))

            totalMatched = totalMatched + 1
            If matchType = "NICKNAME" Then totalNickMatched = totalNickMatched + 1
            If matchType = "FUZZY" Then totalFuzzyMatched = totalFuzzyMatched + 1

            ' CPR/FA - get best date from CPR or FIRSTAID records
            Dim bestCPR As String
            bestCPR = GetBestDate(empRecords, Array("CPR", "CPR/FA", "FIRSTAID"))
            If bestCPR <> "" Then
                totalUpdated = totalUpdated + ApplyValue(wsMonth.Cells(r, NH_CPRFA), bestCPR)
            End If

            ' Med Cert
            Dim medVal As String
            medVal = GetTrainingValue(empRecords, "MED_TRAIN")
            If medVal <> "" Then
                totalUpdated = totalUpdated + ApplyValue(wsMonth.Cells(r, NH_MEDCERT), medVal)
            End If

            ' UKERU
            Dim ukVal As String
            ukVal = GetTrainingValue(empRecords, "Ukeru")
            If ukVal <> "" Then
                totalUpdated = totalUpdated + ApplyValue(wsMonth.Cells(r, NH_UKERU), ukVal)
            End If

            ' Mealtime
            Dim mtVal As String
            mtVal = GetTrainingValue(empRecords, "Mealtime")
            If mtVal <> "" Then
                totalUpdated = totalUpdated + ApplyValue(wsMonth.Cells(r, NH_MEALTIME), mtVal)
            End If
NextNH:
        Next r

        ' TRANSFERS (rows 59-108)
        For r = 59 To 108
            Dim trLast As String, trFirst As String, trStat As String
            trLast = Trim(wsMonth.Cells(r, TR_LNAME).Value & "")
            trFirst = Trim(wsMonth.Cells(r, TR_FNAME).Value & "")
            trStat = UCase(Trim(wsMonth.Cells(r, TR_STATUS).Value & ""))
            If trLast = "" Then GoTo NextTR
            If trStat = "QUIT" Or trStat = "TERMINATED" Or trStat = "RESIGNED" Or trStat = "NCNS" Then GoTo NextTR

            totalTRChecked = totalTRChecked + 1
            Dim matchResultTR As Variant
            matchResultTR = FindInRecords(records, trLast, trFirst)
            If IsEmpty(matchResultTR) Then GoTo NextTR

            Dim empRecordsTR As Collection, matchTypeTR As String
            Set empRecordsTR = matchResultTR(0)
            matchTypeTR = CStr(matchResultTR(1))

            totalMatched = totalMatched + 1
            If matchTypeTR = "NICKNAME" Then totalNickMatched = totalNickMatched + 1
            If matchTypeTR = "FUZZY" Then totalFuzzyMatched = totalFuzzyMatched + 1

            ' UKERU
            Dim ukValTR As String
            ukValTR = GetTrainingValue(empRecordsTR, "Ukeru")
            If ukValTR <> "" Then
                totalUpdated = totalUpdated + ApplyValue(wsMonth.Cells(r, TR_UKERU), ukValTR)
            End If

            ' Mealtime
            Dim mtValTR As String
            mtValTR = GetTrainingValue(empRecordsTR, "Mealtime")
            If mtValTR <> "" Then
                totalUpdated = totalUpdated + ApplyValue(wsMonth.Cells(r, TR_MEALTIME), mtValTR)
            End If
NextTR:
        Next r
NextMonth:
    Next m

    Application.Calculation = xlCalculationAutomatic
    Application.ScreenUpdating = True
    Application.StatusBar = False
    Set m_nickMap = Nothing

    Dim summary As String
    summary = "Sync Complete!" & vbCrLf & vbCrLf & _
              "  New hires checked:    " & totalNHChecked & vbCrLf & _
              "  Transfers checked:    " & totalTRChecked & vbCrLf & _
              "  Matched in Supabase:  " & totalMatched & vbCrLf & _
              "    via nickname:       " & totalNickMatched & vbCrLf & _
              "    via fuzzy:          " & totalFuzzyMatched & vbCrLf & _
              "  Cells updated:        " & totalUpdated

    MsgBox summary, vbInformation, "Supabase Sync"
End Sub


' ============================================================
' Parse compliance JSON into keyed collection
' Returns Collection of objects: { first_name, last_name, training_name, completion_date, excusal_reason, status }
' ============================================================
Private Function ParseComplianceJSON(ByVal jsonStr As String) As Collection
    Dim result As New Collection

    Dim sc As Object
    Set sc = CreateObject("ScriptControl")
    sc.Language = "JScript"
    sc.AddCode "function getLength(arr) { return arr.length; }"
    sc.AddCode "function getItem(arr, i) { return arr[i]; }"
    sc.AddCode "function getValue(obj, key) { var v = obj[key]; return (v === null || v === undefined) ? '' : String(v); }"

    Dim jsonArray As Object
    Set jsonArray = sc.Eval("(" & jsonStr & ")")

    Dim arrLen As Long
    arrLen = sc.Run("getLength", jsonArray)

    Dim i As Long
    For i = 0 To arrLen - 1
        Dim item As Object
        Set item = sc.Run("getItem", jsonArray, i)

        Dim rec(5) As String
        rec(0) = sc.Run("getValue", item, "first_name")
        rec(1) = sc.Run("getValue", item, "last_name")
        rec(2) = sc.Run("getValue", item, "training_name")
        rec(3) = sc.Run("getValue", item, "completion_date")
        rec(4) = sc.Run("getValue", item, "excusal_reason")
        rec(5) = sc.Run("getValue", item, "status")

        result.Add rec
    Next i

    Set sc = Nothing
    Set ParseComplianceJSON = result
End Function


' ============================================================
' FindInRecords -- Match name against parsed compliance data
' Returns Array(Collection of matching records, matchType) or Empty
' ============================================================
Private Function FindInRecords(ByRef records As Collection, _
                               ByVal targetLast As String, _
                               ByVal targetFirst As String) As Variant
    FindInRecords = Empty

    Dim inputLast As String, inputFirst As String
    inputLast = LCase(Trim(targetLast))
    inputFirst = LCase(Trim(targetFirst))
    If Len(inputLast) = 0 Then Exit Function

    Dim namesToTry As Variant
    namesToTry = GetNamesToTry(inputFirst)

    ' Group records by employee name
    Dim bestMatch As New Collection
    Dim bestType As String
    Dim bestFuzzyScore As Double

    Dim i As Long
    For i = 1 To records.Count
        Dim rec As Variant
        rec = records(i)

        Dim recFirst As String, recLast As String
        recFirst = LCase(Trim(rec(0)))
        recLast = LCase(Trim(rec(1)))
        If Len(recLast) = 0 Then GoTo NextRec

        Dim cleanFirst As String
        cleanFirst = CleanFirstName(recFirst)

        ' EXACT LAST NAME MATCH
        If recLast = inputLast Then
            Dim t As Long
            For t = 0 To UBound(namesToTry)
                Dim tryName As String
                tryName = namesToTry(t)

                ' Exact first name
                If cleanFirst = tryName Then
                    If bestType <> "EXACT" Then
                        Set bestMatch = New Collection
                        bestType = IIf(t = 0, "EXACT", "NICKNAME")
                    End If
                    bestMatch.Add rec
                    GoTo NextRec
                End If

                ' Partial match
                If Len(tryName) >= 3 And Len(cleanFirst) >= 3 Then
                    If InStr(1, cleanFirst, tryName, vbTextCompare) > 0 Or _
                       InStr(1, tryName, cleanFirst, vbTextCompare) > 0 Then
                        If bestType <> "EXACT" Then
                            Set bestMatch = New Collection
                            bestType = IIf(t = 0, "EXACT", "NICKNAME")
                        End If
                        bestMatch.Add rec
                        GoTo NextRec
                    End If
                End If
            Next t

            ' Fuzzy first name
            Dim firstSim As Double
            firstSim = StringSimilarity(inputFirst, cleanFirst)
            If firstSim > 0.7 And firstSim > bestFuzzyScore And bestType = "" Then
                bestFuzzyScore = firstSim
                Set bestMatch = New Collection
                bestMatch.Add rec
                bestType = "FUZZY"
            End If

        ' FUZZY LAST NAME
        ElseIf StringSimilarity(inputLast, recLast) > 0.85 Then
            If cleanFirst = inputFirst Then
                Dim lastSim As Double
                lastSim = StringSimilarity(inputLast, recLast)
                If lastSim > bestFuzzyScore And bestType = "" Then
                    bestFuzzyScore = lastSim
                    Set bestMatch = New Collection
                    bestMatch.Add rec
                    bestType = "FUZZY"
                End If
            End If
        End If
NextRec:
    Next i

    If bestMatch.Count > 0 Then
        FindInRecords = Array(bestMatch, bestType)
    End If
End Function


' ============================================================
' GetTrainingValue -- Get completion date or excusal for a training
' ============================================================
Private Function GetTrainingValue(ByRef empRecords As Collection, ByVal trainingName As String) As String
    GetTrainingValue = ""
    Dim i As Long
    For i = 1 To empRecords.Count
        Dim rec As Variant
        rec = empRecords(i)
        If LCase(rec(2)) = LCase(trainingName) Then
            If rec(5) = "excused" Then
                GetTrainingValue = "N/A"
            ElseIf Len(rec(3)) > 0 Then
                GetTrainingValue = rec(3)  ' completion_date
            End If
            Exit Function
        End If
    Next i
End Function


' ============================================================
' GetBestDate -- Get the most recent date from multiple training names
' ============================================================
Private Function GetBestDate(ByRef empRecords As Collection, ByVal trainingNames As Variant) As String
    GetBestDate = ""
    Dim bestDate As Date
    Dim found As Boolean

    Dim n As Long
    For n = LBound(trainingNames) To UBound(trainingNames)
        Dim i As Long
        For i = 1 To empRecords.Count
            Dim rec As Variant
            rec = empRecords(i)
            If LCase(rec(2)) = LCase(trainingNames(n)) Then
                If rec(5) = "excused" Then
                    GetBestDate = "N/A"
                    Exit Function
                ElseIf Len(rec(3)) > 0 And IsDate(rec(3)) Then
                    Dim d As Date
                    d = CDate(rec(3))
                    If Not found Or d > bestDate Then
                        bestDate = d
                        found = True
                    End If
                End If
            End If
        Next i
    Next n

    If found Then GetBestDate = Format(bestDate, "MM/DD/YYYY")
End Function


' ============================================================
' ApplyValue -- Interpret value and write to cell
' Returns 1 if cell was changed, 0 if not
' ============================================================
Private Function ApplyValue(ByRef cell As Range, ByVal rawValue As String) As Long
    ApplyValue = 0
    If Len(rawValue) = 0 Then Exit Function

    Dim upperVal As String: upperVal = UCase(Trim(rawValue))

    ' Excusal -> N/A
    If upperVal = "N/A" Then
        If UCase(Trim(cell.Value & "")) <> "N/A" Then
            cell.Value = "N/A"
            ApplyValue = 1
        End If
        Exit Function
    End If

    ' Date -> Yes + comment with date
    If IsDate(rawValue) Then
        Dim formattedDate As String
        formattedDate = Format(CDate(rawValue), "MM/DD/YYYY")

        ' Skip if already "Yes" with same date in comment
        If UCase(Trim(cell.Value & "")) = "YES" Then
            If Not cell.Comment Is Nothing Then
                If InStr(cell.Comment.Text, formattedDate) > 0 Then
                    Exit Function
                End If
            End If
        End If

        If Not cell.Comment Is Nothing Then cell.Comment.Delete
        cell.Value = "Yes"
        cell.AddComment "Completed: " & formattedDate
        ApplyValue = 1
        Exit Function
    End If
End Function


' ============================================================
' StringSimilarity -- Dice coefficient (unchanged)
' ============================================================
Private Function StringSimilarity(ByVal s1 As String, ByVal s2 As String) As Double
    If s1 = s2 Then StringSimilarity = 1#: Exit Function
    If Len(s1) < 2 Or Len(s2) < 2 Then StringSimilarity = 0#: Exit Function

    Dim bigrams As Object
    Set bigrams = CreateObject("Scripting.Dictionary")
    bigrams.CompareMode = vbTextCompare

    Dim i As Long, bg As String
    For i = 1 To Len(s1) - 1
        bg = Mid(s1, i, 2)
        If bigrams.Exists(bg) Then bigrams(bg) = bigrams(bg) + 1 Else bigrams(bg) = 1
    Next i

    Dim intersect As Long
    For i = 1 To Len(s2) - 1
        bg = Mid(s2, i, 2)
        If bigrams.Exists(bg) Then
            If bigrams(bg) > 0 Then intersect = intersect + 1: bigrams(bg) = bigrams(bg) - 1
        End If
    Next i

    Set bigrams = Nothing
    StringSimilarity = (2# * CDbl(intersect)) / CDbl(Len(s1) + Len(s2) - 2)
End Function


' ============================================================
' FetchFromSupabase -- HTTP GET with Supabase auth headers
' ============================================================
Private Function FetchFromSupabase(ByVal sURL As String) As String
    On Error Resume Next

    ' Method 1: WinHttp
    Dim oHTTP As Object
    Set oHTTP = CreateObject("WinHttp.WinHttpRequest.5.1")
    If Err.Number <> 0 Then Err.Clear: GoTo TryMethod2

    oHTTP.setTimeouts 10000, 10000, 10000, 20000
    oHTTP.Open "GET", sURL, False
    If Err.Number <> 0 Then Err.Clear: Set oHTTP = Nothing: GoTo TryMethod2

    oHTTP.SetRequestHeader "apikey", SUPABASE_ANON_KEY
    oHTTP.SetRequestHeader "Authorization", "Bearer " & SUPABASE_ANON_KEY
    oHTTP.SetRequestHeader "Accept", "application/json"

    oHTTP.Send
    If Err.Number <> 0 Then Err.Clear: Set oHTTP = Nothing: GoTo TryMethod2

    If oHTTP.Status = 200 Then
        FetchFromSupabase = oHTTP.responseText
        Set oHTTP = Nothing
        Exit Function
    End If
    Set oHTTP = Nothing

TryMethod2:
    Err.Clear

    ' Method 2: MSXML2
    Dim oHTTP2 As Object
    Set oHTTP2 = CreateObject("MSXML2.ServerXMLHTTP.6.0")
    If Err.Number <> 0 Then Err.Clear: GoTo FetchFailed

    oHTTP2.setOption 2, 13056
    oHTTP2.setTimeouts 10000, 10000, 10000, 20000
    oHTTP2.Open "GET", sURL, False
    If Err.Number <> 0 Then Err.Clear: Set oHTTP2 = Nothing: GoTo FetchFailed

    oHTTP2.SetRequestHeader "apikey", SUPABASE_ANON_KEY
    oHTTP2.SetRequestHeader "Authorization", "Bearer " & SUPABASE_ANON_KEY
    oHTTP2.SetRequestHeader "Accept", "application/json"

    oHTTP2.Send
    If Err.Number <> 0 Then Err.Clear: Set oHTTP2 = Nothing: GoTo FetchFailed

    If oHTTP2.Status = 200 Then
        FetchFromSupabase = oHTTP2.responseText
        Set oHTTP2 = Nothing
        Exit Function
    End If
    Set oHTTP2 = Nothing

FetchFailed:
    On Error GoTo 0
    FetchFromSupabase = ""
End Function

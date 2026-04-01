Attribute VB_Name = "Module1"
' ============================================================
' EVC Google Sheet Sync — Pull Training Dates
' ============================================================
' Module3 — New Hire Transfer Tracker
' HR Program Coordinator: Kyle Mahoney
' Emory Valley Center
' ============================================================
'
' PURPOSE:
'   Pulls training completion dates FROM the Google Sheet
'   Training tab and updates the New Hire Tracker monthly
'   sheets. Google Sheet is the source of truth.
'
' SYNCS (overlapping trainings only):
'   Google Sheet        →  New Hire Tracker
'   CPR + FIRSTAID      →  CPR/FA      (NH col 12)
'   MED_TRAIN           →  Med Cert    (NH col 13)
'   Ukeru               →  UKERU       (NH col 14, TR col 11)
'   Mealtime            →  Mealtime    (NH col 15, TR col 12)
'
' NAME MATCHING (same logic as Access module):
'   1. Exact last + exact first
'   2. Exact last + partial first (contains match)
'   3. Exact last + name part match ("Micheal ""Mike""" → Mike)
'   4. Exact last + nickname match (full dictionary)
'   5. Exact last + fuzzy first (Dice coefficient > 0.7)
'   6. Fuzzy last (> 0.85) + exact first
'
' RULES:
'   - Date in Google Sheet     → "Yes" + comment with date
'   - Facility/excusal code    → "N/A"
'   - FAILED code              → "No" + comment "Failed"
'   - Blank in Google Sheet    → skip (no data to sync)
'   - Overwrites existing cell (Google Sheet = source of truth)
'   - Skips terminated/resigned/NCNS employees
'
' SETUP:
'   1. Paste this into a new module (Module3)
'   2. Add a button on Dashboard that calls SyncFromGoogleSheet
'      OR add to the double-click handler in ThisWorkbook
'
' USES SAME CSV URL AS ACCESS DATABASE (one source)
' ============================================================

Option Explicit

' ============================================================
' CONFIGURATION
' ============================================================
Private Const GOOGLE_CSV_URL As String = _
    "https://docs.google.com/spreadsheets/d/e/2PACX-1vT5agoZ2dk1qPo11He4LcKlPsLzHqoL-Q6oF6t8jfpe-ghIb4b6wmmRyDfnZ48U7jCzGYHqI_-JhMaw/pub?gid=524304422&single=true&output=csv"

' CSV column indices (0-based, from Training sheet headers)
Private Const CSV_LNAME As Long = 0       ' L NAME
Private Const CSV_FNAME As Long = 1       ' F NAME
Private Const CSV_CPR As Long = 4         ' CPR
Private Const CSV_FIRSTAID As Long = 5    ' FIRSTAID
Private Const CSV_MEDTRAIN As Long = 6    ' MED_TRAIN
Private Const CSV_MEALTIME As Long = 8    ' Mealtime
Private Const CSV_UKERU As Long = 10      ' Ukeru

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

' Known facility/excusal codes (not dates, not failures)
Private Const EXCUSAL_CODES As String = _
    "|FACILITIES|ELC|LLL|HR|RN|EI|ECF|NA|N/A|"

' Module-level nickname dictionary (loaded once per sync)
Private m_nickMap As Object


' ============================================================
' NICKNAMES — Full dictionary (matches Access module exactly)
' ============================================================
Private Function GetNicknames() As Object
    Dim d As Object
    Set d = CreateObject("Scripting.Dictionary")
    d.CompareMode = vbTextCompare
    
    ' ── Standard nicknames ──
    d("mike") = "michael,micheal": d("michael") = "mike": d("micheal") = "mike"
    d("bob") = "robert": d("robert") = "bob,bobby": d("bobby") = "robert,bob"
    d("bill") = "william": d("william") = "bill,will,billy": d("will") = "william"
    d("jim") = "james": d("james") = "jim,jimmy": d("jimmy") = "james"
    d("joe") = "joseph": d("joseph") = "joe,joey"
    d("tom") = "thomas": d("thomas") = "tom,tommy"
    d("dick") = "richard": d("richard") = "dick,rick,rich": d("rick") = "richard": d("rich") = "richard"
    d("dan") = "daniel": d("daniel") = "dan,danny": d("danny") = "daniel"
    d("dave") = "david": d("david") = "dave"
    d("steve") = "steven,stephen": d("steven") = "steve": d("stephen") = "steve"
    d("matt") = "matthew,mathew": d("matthew") = "matt": d("mathew") = "matt"
    d("chris") = "christopher,christian": d("christopher") = "chris": d("christian") = "chris"
    d("pat") = "patricia,patrick": d("patricia") = "pat,patty": d("patrick") = "pat"
    d("jen") = "jennifer": d("jennifer") = "jen,jenny": d("jenny") = "jennifer"
    d("liz") = "elizabeth": d("elizabeth") = "liz,beth,betsy": d("beth") = "elizabeth": d("betsy") = "elizabeth"
    d("kate") = "katherine,kathryn,kathy": d("kathy") = "katherine,kathryn": d("katie") = "katherine,kathryn"
    d("sue") = "susan": d("susan") = "sue,susie": d("susie") = "susan"
    d("meg") = "megan,meghan,margaret": d("megan") = "meg": d("meghan") = "meg": d("margaret") = "meg"
    d("sam") = "samantha,samuel": d("samantha") = "sam": d("samuel") = "sam"
    d("tony") = "anthony,antonio": d("anthony") = "tony": d("antonio") = "tony"
    d("nick") = "nicholas": d("nicholas") = "nick"
    d("alex") = "alexander,alexandra,alexis": d("alexander") = "alex": d("alexandra") = "alex"
    d("ed") = "edward,edgar": d("edward") = "ed,eddie": d("edgar") = "ed"
    d("josh") = "joshua": d("joshua") = "josh"
    d("jon") = "jonathan,jonathon": d("jonathan") = "jon"
    d("tim") = "timothy": d("timothy") = "tim"
    d("larry") = "lawrence": d("lawrence") = "larry"
    d("cindy") = "cynthia": d("cynthia") = "cindy"
    d("sandy") = "sandra,sandi": d("sandra") = "sandy,sandi": d("sandi") = "sandra,sandy"
    d("barb") = "barbara": d("barbara") = "barb"
    d("deb") = "deborah,debra": d("deborah") = "deb,debbie": d("debra") = "deb,debbie": d("debbie") = "deborah,debra"
    d("don") = "donald": d("donald") = "don,donny"
    d("jeff") = "jeffrey,jeffery": d("jeffrey") = "jeff": d("jeffery") = "jeff"
    d("ted") = "theodore,edward": d("theodore") = "ted"
    d("ray") = "raymond": d("raymond") = "ray"
    d("ron") = "ronald": d("ronald") = "ron,ronnie"
    d("phil") = "phillip,philip": d("phillip") = "phil": d("philip") = "phil"
    d("kim") = "kimberly": d("kimberly") = "kim"
    d("mel") = "melanie": d("melanie") = "mel"
    d("cassie") = "cassandra": d("cassandra") = "cassie"
    
    ' ── EVC-specific name mappings ──
    d("frankie") = "niyonyishu": d("niyonyishu") = "frankie"
    d("jamie") = "everette": d("everette") = "jamie"
    d("hope") = "samantha": d("austin") = "robert"
    d("elise") = "elisete": d("elisete") = "elise"
    d("leah") = "raeleah": d("raeleah") = "leah"
    d("abbi") = "abbigayle,abigail": d("abbigayle") = "abbi": d("abigail") = "abbey,abbi": d("abbey") = "abigail"
    d("zachary") = "zachery": d("zachery") = "zachary"
    d("annette") = "carol"
    d("lani") = "iolani": d("iolani") = "lani"
    d("bimbor") = "abimbola": d("abimbola") = "bimbor"
    d("madilynn") = "madison"
    d("nichole") = "randi": d("randi") = "nichole"
    d("aaron") = "richard"
    d("ravyn") = "jonni": d("jonni") = "ravyn"
    d("rasshad") = "ikee": d("ikee") = "rasshad"
    d("kay") = "deborah,katherine,kathryn"
    d("nikki") = "heather": d("heather") = "nikki"
    
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
' MAIN: Sync training dates from Google Sheet
' ============================================================
Public Sub SyncFromGoogleSheet()
    Dim answer As VbMsgBoxResult
    answer = MsgBox("Pull training dates from the Google Sheet?" & vbCrLf & vbCrLf & _
                    "This will update these columns on all monthly tabs:" & vbCrLf & _
                    "  - CPR/FA" & vbCrLf & _
                    "  - Med Cert" & vbCrLf & _
                    "  - UKERU" & vbCrLf & _
                    "  - Mealtime" & vbCrLf & vbCrLf & _
                    "Google Sheet is the source of truth — existing values will be overwritten.", _
                    vbYesNo + vbQuestion, "Sync Training Dates")
    If answer <> vbYes Then Exit Sub
    
    ' ── Load nickname dictionary once ──
    Set m_nickMap = GetNicknames()
    
    ' ── Download CSV ──
    Application.StatusBar = "Downloading training data from Google Sheet..."
    Dim tempFile As String
    tempFile = Environ("TEMP") & "\evc_training_sync.csv"
    
    If Not DownloadFile(GOOGLE_CSV_URL, tempFile) Then
        MsgBox "Could not download from Google Sheets." & vbCrLf & _
               "Check your internet connection and try again.", _
               vbExclamation, "Download Failed"
        Application.StatusBar = False
        Set m_nickMap = Nothing
        Exit Sub
    End If
    
    ' ── Parse CSV into array ──
    Application.StatusBar = "Parsing training data..."
    Dim csvData As Collection
    Set csvData = ParseCSV(tempFile)
    If Dir(tempFile) <> "" Then Kill tempFile
    
    If csvData.count < 2 Then
        MsgBox "No data found in the download.", vbExclamation, "Sync"
        Application.StatusBar = False
        Set m_nickMap = Nothing
        Exit Sub
    End If
    
    ' ── Process all monthly tabs ──
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
        
        ' ── NEW HIRES (rows 5-54) ──
        For r = 5 To 54
            Dim nhLast As String, nhFirst As String, nhStat As String
            nhLast = Trim(wsMonth.Cells(r, NH_LNAME).Value & "")
            nhFirst = Trim(wsMonth.Cells(r, NH_FNAME).Value & "")
            nhStat = UCase(Trim(wsMonth.Cells(r, NH_STATUS).Value & ""))
            If nhLast = "" Then GoTo NextNH
            If nhStat = "TERMINATED" Or nhStat = "NCNS" Or nhStat = "RESIGNED" Then GoTo NextNH
            
            totalNHChecked = totalNHChecked + 1
            Dim matchResult As Variant
            matchResult = FindInCSV(csvData, nhLast, nhFirst)
            If IsEmpty(matchResult) Then GoTo NextNH
            
            Dim csvRow As Variant, matchType As String
            csvRow = matchResult(0)
            matchType = CStr(matchResult(1))
            
            totalMatched = totalMatched + 1
            If matchType = "NICKNAME" Then totalNickMatched = totalNickMatched + 1
            If matchType = "FUZZY" Then totalFuzzyMatched = totalFuzzyMatched + 1
            
            ' CPR/FA — use most recent of CPR and FIRSTAID
            Dim bestCPR As String
            bestCPR = BetterDate(CStr(csvRow(CSV_CPR)), CStr(csvRow(CSV_FIRSTAID)))
            If bestCPR <> "" Then
                totalUpdated = totalUpdated + ApplyValue(wsMonth.Cells(r, NH_CPRFA), bestCPR)
            End If
            
            ' Med Cert — from MED_TRAIN
            Dim medVal As String: medVal = Trim(CStr(csvRow(CSV_MEDTRAIN)))
            If medVal <> "" Then
                totalUpdated = totalUpdated + ApplyValue(wsMonth.Cells(r, NH_MEDCERT), medVal)
            End If
            
            ' UKERU
            Dim ukVal As String: ukVal = Trim(CStr(csvRow(CSV_UKERU)))
            If ukVal <> "" Then
                totalUpdated = totalUpdated + ApplyValue(wsMonth.Cells(r, NH_UKERU), ukVal)
            End If
            
            ' Mealtime
            Dim mtVal As String: mtVal = Trim(CStr(csvRow(CSV_MEALTIME)))
            If mtVal <> "" Then
                totalUpdated = totalUpdated + ApplyValue(wsMonth.Cells(r, NH_MEALTIME), mtVal)
            End If
NextNH:
        Next r
        
        ' ── TRANSFERS (rows 59-108) ──
        For r = 59 To 108
            Dim trLast As String, trFirst As String, trStat As String
            trLast = Trim(wsMonth.Cells(r, TR_LNAME).Value & "")
            trFirst = Trim(wsMonth.Cells(r, TR_FNAME).Value & "")
            trStat = UCase(Trim(wsMonth.Cells(r, TR_STATUS).Value & ""))
            If trLast = "" Then GoTo NextTR
            If trStat = "QUIT" Or trStat = "TERMINATED" Or trStat = "RESIGNED" Or trStat = "NCNS" Then GoTo NextTR
            
            totalTRChecked = totalTRChecked + 1
            Dim matchResultTR As Variant
            matchResultTR = FindInCSV(csvData, trLast, trFirst)
            If IsEmpty(matchResultTR) Then GoTo NextTR
            
            Dim csvRowTR As Variant, matchTypeTR As String
            csvRowTR = matchResultTR(0)
            matchTypeTR = CStr(matchResultTR(1))
            
            totalMatched = totalMatched + 1
            If matchTypeTR = "NICKNAME" Then totalNickMatched = totalNickMatched + 1
            If matchTypeTR = "FUZZY" Then totalFuzzyMatched = totalFuzzyMatched + 1
            
            ' UKERU (transfer col 11)
            Dim ukValTR As String: ukValTR = Trim(CStr(csvRowTR(CSV_UKERU)))
            If ukValTR <> "" Then
                totalUpdated = totalUpdated + ApplyValue(wsMonth.Cells(r, TR_UKERU), ukValTR)
            End If
            
            ' Mealtime (transfer col 12)
            Dim mtValTR As String: mtValTR = Trim(CStr(csvRowTR(CSV_MEALTIME)))
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
              "  Matched in Google:    " & totalMatched & vbCrLf & _
              "    via nickname:       " & totalNickMatched & vbCrLf & _
              "    via fuzzy:          " & totalFuzzyMatched & vbCrLf & _
              "  Cells updated:        " & totalUpdated
    
    MsgBox summary, vbInformation, "Google Sheet Sync"
End Sub


' ============================================================
' FindInCSV — Match name against parsed CSV data
' Returns Array(row, matchType) or Empty
'
' Match priority (same as Access CheckForDuplicateInTable):
'   1. Exact last + exact first → "EXACT"
'   2. Exact last + partial first (contains) → "EXACT"
'   3. Exact last + name part match (split on spaces) → "EXACT"
'   4. Exact last + nickname match (dictionary) → "NICKNAME"
'   5. Exact last + fuzzy first (Dice > 0.7) → "FUZZY"
'   6. Fuzzy last (Dice > 0.85) + exact first → "FUZZY"
' ============================================================
Private Function FindInCSV(ByRef csvData As Collection, _
                           ByVal targetLast As String, _
                           ByVal targetFirst As String) As Variant
    FindInCSV = Empty
    
    Dim inputLast As String, inputFirst As String
    inputLast = LCase(Trim(targetLast))
    inputFirst = LCase(Trim(targetFirst))
    If Len(inputLast) = 0 Then Exit Function
    
    ' Build all first names to try (input + its nicknames)
    Dim namesToTry As Variant
    namesToTry = GetNamesToTry(inputFirst)
    
    Dim bestFuzzyRow As Variant
    Dim bestFuzzyScore As Double
    bestFuzzyScore = 0
    
    Dim i As Long
    For i = 2 To csvData.count  ' Skip header row
        Dim row As Variant
        row = csvData(i)
        
        Dim csvLast As String, csvFirst As String, cleanFirst As String
        csvLast = LCase(Trim(CStr(row(CSV_LNAME))))
        csvFirst = LCase(Trim(CStr(row(CSV_FNAME))))
        If Len(csvLast) = 0 Then GoTo NextCSV
        
        cleanFirst = CleanFirstName(csvFirst)
        
        ' ══════════════════════════════════════════
        ' EXACT LAST NAME MATCH
        ' ══════════════════════════════════════════
        If csvLast = inputLast Then
            
            Dim t As Long, tryName As String
            Dim csvParts() As String
            csvParts = Split(cleanFirst, " ")
            
            For t = 0 To UBound(namesToTry)
                tryName = namesToTry(t)
                
                ' ── 1. Exact first name ──
                If cleanFirst = tryName Then
                    If t = 0 Then
                        FindInCSV = Array(row, "EXACT")
                    Else
                        FindInCSV = Array(row, "NICKNAME")
                    End If
                    Exit Function
                End If
                
                ' ── 2. Partial match (contains, min 3 chars) ──
                If Len(tryName) >= 3 And Len(cleanFirst) >= 3 Then
                    If InStr(1, cleanFirst, tryName, vbTextCompare) > 0 Or _
                       InStr(1, tryName, cleanFirst, vbTextCompare) > 0 Then
                        If t = 0 Then
                            FindInCSV = Array(row, "EXACT")
                        Else
                            FindInCSV = Array(row, "NICKNAME")
                        End If
                        Exit Function
                    End If
                End If
                
                ' ── 3. Name part match (split first name) ──
                Dim p As Long
                For p = 0 To UBound(csvParts)
                    If csvParts(p) = tryName Then
                        If t = 0 Then
                            FindInCSV = Array(row, "EXACT")
                        Else
                            FindInCSV = Array(row, "NICKNAME")
                        End If
                        Exit Function
                    End If
                Next p
            Next t
            
            ' ── 4. Reverse nickname: CSV name parts → nicknames → our input ──
            Dim cp As Long
            For cp = 0 To UBound(csvParts)
                If m_nickMap.Exists(csvParts(cp)) Then
                    Dim rowNicks As Variant, rn As Long
                    rowNicks = Split(m_nickMap(csvParts(cp)), ",")
                    For rn = 0 To UBound(rowNicks)
                        For t = 0 To UBound(namesToTry)
                            If Trim(rowNicks(rn)) = namesToTry(t) Then
                                FindInCSV = Array(row, "NICKNAME")
                                Exit Function
                            End If
                        Next t
                    Next rn
                End If
            Next cp
            
            ' ── 5. Fuzzy first name (Dice > 0.7) ──
            Dim firstSim As Double
            firstSim = StringSimilarity(inputFirst, cleanFirst)
            If firstSim > 0.7 And firstSim > bestFuzzyScore Then
                bestFuzzyScore = firstSim
                bestFuzzyRow = row
            End If
        
        ' ══════════════════════════════════════════
        ' FUZZY LAST NAME (> 0.85) + EXACT FIRST
        ' ══════════════════════════════════════════
        ElseIf StringSimilarity(inputLast, csvLast) > 0.85 Then
            cleanFirst = CleanFirstName(csvFirst)
            If cleanFirst = inputFirst Then
                Dim lastSim As Double
                lastSim = StringSimilarity(inputLast, csvLast)
                If lastSim > bestFuzzyScore Then
                    bestFuzzyScore = lastSim
                    bestFuzzyRow = row
                End If
            End If
        End If
NextCSV:
    Next i
    
    ' Return best fuzzy match if found
    If bestFuzzyScore > 0.7 Then
        FindInCSV = Array(bestFuzzyRow, "FUZZY")
    End If
End Function


' ============================================================
' ApplyValue — Interpret Google Sheet value and write to cell
' Returns 1 if cell was changed, 0 if not
' ============================================================
Private Function ApplyValue(ByRef cell As Range, ByVal rawValue As String) As Long
    ApplyValue = 0
    If Len(rawValue) = 0 Then Exit Function
    
    Dim upperVal As String: upperVal = UCase(Trim(rawValue))
    
    ' ── Excusal/facility code → N/A ──
    If InStr(1, EXCUSAL_CODES, "|" & upperVal & "|", vbTextCompare) > 0 Then
        If UCase(Trim(cell.Value & "")) <> "N/A" Then
            cell.Value = "N/A"
            ApplyValue = 1
        End If
        Exit Function
    End If
    
    ' ── Failure code → No ──
    If Left(upperVal, 4) = "FAIL" Then
        If Not cell.Comment Is Nothing Then cell.Comment.Delete
        cell.Value = "No"
        cell.AddComment "Failed (per Google Sheet)"
        ApplyValue = 1
        Exit Function
    End If
    
    ' ── Date → Yes + comment with date ──
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
    
    ' ── Anything else (unknown code) → skip ──
End Function


' ============================================================
' BetterDate — Returns the more recent of two date strings
' ============================================================
Private Function BetterDate(ByVal d1 As String, ByVal d2 As String) As String
    Dim isDate1 As Boolean, isDate2 As Boolean
    d1 = Trim(d1): d2 = Trim(d2)
    isDate1 = (Len(d1) > 0 And IsDate(d1))
    isDate2 = (Len(d2) > 0 And IsDate(d2))
    
    If isDate1 And isDate2 Then
        If CDate(d1) >= CDate(d2) Then BetterDate = d1 Else BetterDate = d2
    ElseIf isDate1 Then
        BetterDate = d1
    ElseIf isDate2 Then
        BetterDate = d2
    Else
        ' Neither is a date — pass through excusal/failure if present
        If Len(d1) > 0 Then BetterDate = d1: Exit Function
        If Len(d2) > 0 Then BetterDate = d2: Exit Function
        BetterDate = ""
    End If
End Function


' ============================================================
' StringSimilarity — Dice coefficient (same as Access module)
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
' ParseCSV — Read CSV file into Collection of Variant arrays
' ============================================================
Private Function ParseCSV(ByVal filePath As String) As Collection
    Dim result As New Collection
    Dim fNum As Integer, sLine As String
    
    fNum = FreeFile
    Open filePath For Input As #fNum
    
    Do While Not EOF(fNum)
        Line Input #fNum, sLine
        If Len(Trim(sLine)) > 0 Then
            result.Add SplitCSVLine(sLine)
        End If
    Loop
    
    Close #fNum
    Set ParseCSV = result
End Function


' ============================================================
' SplitCSVLine — Parse one CSV line respecting quoted fields
' ============================================================
Private Function SplitCSVLine(ByVal sLine As String) As Variant
    Dim result() As String
    Dim fieldCount As Long
    Dim inQuote As Boolean
    Dim current As String
    Dim c As String
    Dim pos As Long
    
    fieldCount = 0
    ReDim result(0)
    inQuote = False
    current = ""
    
    For pos = 1 To Len(sLine)
        c = Mid(sLine, pos, 1)
        If c = """" Then
            inQuote = Not inQuote
        ElseIf c = "," And Not inQuote Then
            ReDim Preserve result(fieldCount)
            result(fieldCount) = current
            fieldCount = fieldCount + 1
            current = ""
        Else
            current = current & c
        End If
    Next pos
    
    ReDim Preserve result(fieldCount)
    result(fieldCount) = current
    SplitCSVLine = result
End Function


' ============================================================
' DownloadFile — Two methods with timeouts
' (Same pattern as Access module)
' ============================================================
Private Function DownloadFile(ByVal sURL As String, ByVal sPath As String) As Boolean
    On Error Resume Next
    
    ' Method 1: WinHttp
    Dim oHTTP As Object
    Set oHTTP = CreateObject("WinHttp.WinHttpRequest.5.1")
    If Err.Number <> 0 Then Err.Clear: GoTo TryMethod2
    
    oHTTP.setTimeouts 10000, 10000, 10000, 20000
    oHTTP.Open "GET", sURL, False
    If Err.Number <> 0 Then Err.Clear: Set oHTTP = Nothing: GoTo TryMethod2
    
    oHTTP.Send
    If Err.Number <> 0 Then Err.Clear: Set oHTTP = Nothing: GoTo TryMethod2
    
    If oHTTP.Status = 200 Then
        Dim oStream As Object
        Set oStream = CreateObject("ADODB.Stream")
        oStream.Type = 1
        oStream.Open
        oStream.Write oHTTP.responseBody
        oStream.SaveToFile sPath, 2
        oStream.Close
        Set oStream = Nothing: Set oHTTP = Nothing
        If Err.Number = 0 Then DownloadFile = True: Exit Function
        Err.Clear
    End If
    Set oHTTP = Nothing

TryMethod2:
    Err.Clear
    
    ' Method 2: MSXML2
    Dim oHTTP2 As Object
    Set oHTTP2 = CreateObject("MSXML2.ServerXMLHTTP.6.0")
    If Err.Number <> 0 Then Err.Clear: GoTo DownloadFailed
    
    oHTTP2.setOption 2, 13056
    oHTTP2.setTimeouts 10000, 10000, 10000, 20000
    oHTTP2.Open "GET", sURL, False
    If Err.Number <> 0 Then Err.Clear: Set oHTTP2 = Nothing: GoTo DownloadFailed
    
    oHTTP2.Send
    If Err.Number <> 0 Then Err.Clear: Set oHTTP2 = Nothing: GoTo DownloadFailed
    
    If oHTTP2.Status = 200 Then
        Dim oStream2 As Object
        Set oStream2 = CreateObject("ADODB.Stream")
        oStream2.Type = 1
        oStream2.Open
        oStream2.Write oHTTP2.responseBody
        oStream2.SaveToFile sPath, 2
        oStream2.Close
        Set oStream2 = Nothing: Set oHTTP2 = Nothing
        If Err.Number = 0 Then DownloadFile = True: Exit Function
        Err.Clear
    End If
    Set oHTTP2 = Nothing

DownloadFailed:
    On Error GoTo 0
    DownloadFile = False
End Function

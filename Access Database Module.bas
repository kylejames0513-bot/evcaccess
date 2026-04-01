Attribute VB_Name = "Module1"
' ============================================================
' EVC Training Access - Auto Import from Google Sheets (v4)
' ============================================================
' REWRITTEN FOR .mdb + MULTI-USER FIX
' ============================================================
' How it works:
'   - AutoExec calls ImportTrainingAccess() on every open
'   - Checks Windows username against ADMIN_USERNAME
'   - If admin: downloads fresh CSV, imports into table
'   - If anyone else: does nothing, uses existing table data
'   - No HTTP calls on non-admin machines = no freezing
'
' SETUP:
' 1. Set ADMIN_USERNAME to your Windows username
' 2. Set GOOGLE_CSV_URL to your published CSV URL
' 3. AutoExec macro: RunCode > ImportTrainingAccess()
' ============================================================

Option Compare Database
Option Explicit

' ============================================================
' CONFIGURATION
' ============================================================
Private Const ADMIN_USERNAME As String = "kyle.mahoney"

Private Const GOOGLE_CSV_URL As String = "https://docs.google.com/spreadsheets/d/e/2PACX-1vSrqHNYlebocrv8AARfLon065YuST3Yo_PSwH5WGoBK6B4bjlBKGNGlX82ccLq5kZqkZ5Devknz2oho/pub?gid=313450341&single=true&output=csv"

Private Const TABLE_NAME As String = "tblTrainingAccess"

' ============================================================
' Main function: runs via AutoExec
' ============================================================
Public Function ImportTrainingAccess() As Boolean
    On Error GoTo ErrHandler
    
    Dim currentUser As String
    currentUser = LCase(Trim(Environ("USERNAME")))
    
    ' Non-admin: skip download, use existing data
    If currentUser <> LCase(ADMIN_USERNAME) Then
        ImportTrainingAccess = True
        Exit Function
    End If
    
    ' Admin: download and import
    Dim tempFile As String
    tempFile = Environ("TEMP") & "\training_access_import.csv"
    
    If Not DownloadFile(GOOGLE_CSV_URL, tempFile) Then
        MsgBox "Could not download from Google Sheets." & vbCrLf & _
               "Opening with previous data.", _
               vbExclamation, "Import Notice"
        ImportTrainingAccess = False
        Exit Function
    End If
    
    If TableExists(TABLE_NAME) Then
        DoCmd.DeleteObject acTable, TABLE_NAME
    End If
    
    ImportCSVAllText tempFile, TABLE_NAME
    
    If Dir(tempFile) <> "" Then Kill tempFile
    
    ImportTrainingAccess = True
    Exit Function
    
ErrHandler:
    MsgBox "Import error: " & Err.Description & vbCrLf & _
           "Opening with previous data.", _
           vbExclamation, "Import Notice"
    ImportTrainingAccess = False
End Function

' ============================================================
' Manual import from Immediate Window or button
' ============================================================
Public Function ManualImport() As Boolean
    Dim tempFile As String
    tempFile = Environ("TEMP") & "\training_access_import.csv"
    
    If Not DownloadFile(GOOGLE_CSV_URL, tempFile) Then
        MsgBox "Download failed.", vbExclamation, "Import"
        ManualImport = False
        Exit Function
    End If
    
    If TableExists(TABLE_NAME) Then
        DoCmd.DeleteObject acTable, TABLE_NAME
    End If
    
    ImportCSVAllText tempFile, TABLE_NAME
    If Dir(tempFile) <> "" Then Kill tempFile
    
    MsgBox "Import successful! Rows: " & DCount("*", TABLE_NAME), _
           vbInformation, "Import"
    ManualImport = True
End Function

' ============================================================
' Download file - two methods with timeouts, no API fallback
' ============================================================
Private Function DownloadFile(ByVal sURL As String, ByVal sPath As String) As Boolean
    On Error Resume Next
    
    Dim oHTTP As Object
    Set oHTTP = CreateObject("WinHttp.WinHttpRequest.5.1")
    If Err.Number <> 0 Then
        Err.Clear
        GoTo TryMethod2
    End If
    
    oHTTP.setTimeouts 10000, 10000, 10000, 20000
    oHTTP.Open "GET", sURL, False
    If Err.Number <> 0 Then
        Err.Clear
        Set oHTTP = Nothing
        GoTo TryMethod2
    End If
    
    oHTTP.Send
    If Err.Number <> 0 Then
        Err.Clear
        Set oHTTP = Nothing
        GoTo TryMethod2
    End If
    
    If oHTTP.Status = 200 Then
        Dim oStream As Object
        Set oStream = CreateObject("ADODB.Stream")
        oStream.Type = 1
        oStream.Open
        oStream.Write oHTTP.responseBody
        oStream.SaveToFile sPath, 2
        oStream.Close
        Set oStream = Nothing
        Set oHTTP = Nothing
        If Err.Number = 0 Then
            DownloadFile = True
            Exit Function
        End If
        Err.Clear
    End If
    Set oHTTP = Nothing

TryMethod2:
    Err.Clear
    
    Dim oHTTP2 As Object
    Set oHTTP2 = CreateObject("MSXML2.ServerXMLHTTP.6.0")
    If Err.Number <> 0 Then
        Err.Clear
        GoTo DownloadFailed
    End If
    
    oHTTP2.setOption 2, 13056
    oHTTP2.setTimeouts 10000, 10000, 10000, 20000
    oHTTP2.Open "GET", sURL, False
    If Err.Number <> 0 Then
        Err.Clear
        Set oHTTP2 = Nothing
        GoTo DownloadFailed
    End If
    
    oHTTP2.Send
    If Err.Number <> 0 Then
        Err.Clear
        Set oHTTP2 = Nothing
        GoTo DownloadFailed
    End If
    
    If oHTTP2.Status = 200 Then
        Dim oStream2 As Object
        Set oStream2 = CreateObject("ADODB.Stream")
        oStream2.Type = 1
        oStream2.Open
        oStream2.Write oHTTP2.responseBody
        oStream2.SaveToFile sPath, 2
        oStream2.Close
        Set oStream2 = Nothing
        Set oHTTP2 = Nothing
        If Err.Number = 0 Then
            DownloadFile = True
            Exit Function
        End If
        Err.Clear
    End If
    Set oHTTP2 = Nothing

DownloadFailed:
    On Error GoTo 0
    DownloadFile = False
End Function

' ============================================================
' Import CSV with all fields as Text
' ============================================================
Private Sub ImportCSVAllText(ByVal sFile As String, ByVal sTable As String)
    Dim db As Object
    Dim fNum As Integer
    Dim sLine As String
    Dim vHeaders As Variant
    Dim vFields As Variant
    Dim sSQL As String
    Dim i As Long
    
    Set db = CurrentDb
    fNum = FreeFile
    Open sFile For Input As #fNum
    
    Line Input #fNum, sLine
    vHeaders = SplitCSVLine(sLine)
    
    sSQL = "CREATE TABLE [" & sTable & "] ("
    For i = 0 To UBound(vHeaders)
        Dim colName As String
        colName = Trim(Replace(Replace(vHeaders(i), """", ""), "'", ""))
        If Len(colName) = 0 Then colName = "Field" & (i + 1)
        colName = Replace(colName, "/", "_")
        colName = Replace(colName, "\", "_")
        colName = Replace(colName, ".", "_")
        If i > 0 Then sSQL = sSQL & ", "
        sSQL = sSQL & "[" & colName & "] TEXT(255)"
    Next i
    sSQL = sSQL & ")"
    db.Execute sSQL
    
    Dim colCount As Long
    colCount = UBound(vHeaders) + 1
    
    Do While Not EOF(fNum)
        Line Input #fNum, sLine
        If Len(Trim(sLine)) = 0 Then GoTo NextLine
        
        vFields = SplitCSVLine(sLine)
        
        sSQL = "INSERT INTO [" & sTable & "] VALUES ("
        For i = 0 To colCount - 1
            If i > 0 Then sSQL = sSQL & ", "
            If i <= UBound(vFields) Then
                Dim val As String
                val = Trim(vFields(i))
                If Len(val) >= 2 And Left(val, 1) = """" And Right(val, 1) = """" Then
                    val = Mid(val, 2, Len(val) - 2)
                End If
                val = Replace(val, "'", "''")
                sSQL = sSQL & "'" & val & "'"
            Else
                sSQL = sSQL & "NULL"
            End If
        Next i
        sSQL = sSQL & ")"
        
        On Error Resume Next
        db.Execute sSQL
        If Err.Number <> 0 Then Err.Clear
        On Error GoTo 0
NextLine:
    Loop
    
    Close #fNum
    Set db = Nothing
End Sub

' ============================================================
' Parse CSV line respecting quoted fields
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
' Check if table exists
' ============================================================
Private Function TableExists(ByVal sTable As String) As Boolean
    On Error Resume Next
    Dim sTest As String
    sTest = CurrentDb.TableDefs(sTable).Name
    TableExists = (Err.Number = 0)
    Err.Clear
    On Error GoTo 0
End Function

' ============================================================
' Nicknames
' ============================================================
Private Function GetNicknames() As Object
    Dim d As Object
    Set d = CreateObject("Scripting.Dictionary")
    d.CompareMode = vbTextCompare
    
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
' CheckForDuplicateInTable
' ============================================================
Public Function CheckForDuplicateInTable( _
    ByVal newFirst As String, _
    ByVal newLast As String, _
    Optional ByVal targetTable As String = "", _
    Optional ByVal lNameField As String = "L NAME", _
    Optional ByVal fNameField As String = "F NAME", _
    Optional ByVal silentMode As Boolean = False _
) As Boolean
    On Error GoTo ErrHandler
    
    If Len(targetTable) = 0 Then targetTable = TABLE_NAME
    newFirst = Trim(newFirst)
    newLast = Trim(newLast)
    If Len(newFirst) = 0 Or Len(newLast) = 0 Then
        CheckForDuplicateInTable = True: Exit Function
    End If
    If Not TableExists(targetTable) Then
        CheckForDuplicateInTable = True: Exit Function
    End If
    
    Dim db As DAO.Database
    Dim rs As DAO.Recordset
    Set db = CurrentDb
    Set rs = db.OpenRecordset("SELECT [" & lNameField & "], [" & fNameField & "] FROM [" & targetTable & "]", dbOpenSnapshot)
    
    Dim nickMap As Object
    Set nickMap = GetNicknames()
    
    Dim inputFirst As String, inputLast As String
    inputFirst = LCase(newFirst): inputLast = LCase(newLast)
    
    Dim namesToTry() As String, nameCount As Long
    nameCount = 0: ReDim namesToTry(0): namesToTry(0) = inputFirst
    If nickMap.Exists(inputFirst) Then
        Dim nicks As Variant: nicks = Split(nickMap(inputFirst), ",")
        Dim nn As Long
        For nn = 0 To UBound(nicks)
            nameCount = nameCount + 1
            ReDim Preserve namesToTry(nameCount)
            namesToTry(nameCount) = Trim(nicks(nn))
        Next nn
    End If
    
    Dim matchType As String, matchName As String, bestCloseScore As Double
    
    Do While Not rs.EOF
        Dim existLast As String, existFirst As String
        existLast = LCase(Trim(Nz(rs.Fields(lNameField).Value, "")))
        existFirst = LCase(Trim(Nz(rs.Fields(fNameField).Value, "")))
        If Len(existLast) = 0 Then GoTo NextRow
        
        Dim cleanFirst As String
        cleanFirst = Replace(Replace(Replace(Replace(existFirst, """", " "), "'", " "), "(", " "), ")", " ")
        Do While InStr(cleanFirst, "  ") > 0: cleanFirst = Replace(cleanFirst, "  ", " "): Loop
        cleanFirst = Trim(cleanFirst)
        Dim cleanParts() As String: cleanParts = Split(cleanFirst, " ")
        
        If existLast = inputLast Then
            Dim t As Long
            For t = 0 To UBound(namesToTry)
                Dim tryName As String: tryName = namesToTry(t)
                If cleanFirst = tryName Then
                    matchType = "EXACT"
                    matchName = Nz(rs.Fields(fNameField).Value, "") & " " & Nz(rs.Fields(lNameField).Value, "")
                    GoTo MatchFound
                End If
                Dim p As Long
                For p = 0 To UBound(cleanParts)
                    If cleanParts(p) = tryName Then
                        matchType = "EXACT"
                        matchName = Nz(rs.Fields(fNameField).Value, "") & " " & Nz(rs.Fields(lNameField).Value, "")
                        GoTo MatchFound
                    End If
                Next p
                For p = 0 To UBound(cleanParts)
                    If nickMap.Exists(cleanParts(p)) Then
                        Dim rowNicks As Variant: rowNicks = Split(nickMap(cleanParts(p)), ",")
                        Dim rn As Long
                        For rn = 0 To UBound(rowNicks)
                            If Trim(rowNicks(rn)) = tryName Then
                                matchType = "NICKNAME"
                                matchName = Nz(rs.Fields(fNameField).Value, "") & " " & Nz(rs.Fields(lNameField).Value, "")
                                GoTo MatchFound
                            End If
                        Next rn
                    End If
                Next p
            Next t
            
            Dim firstSim As Double: firstSim = StringSimilarity(inputFirst, cleanFirst)
            If firstSim > 0.7 And firstSim < 1# And firstSim > bestCloseScore Then
                matchType = "CLOSE"
                matchName = Nz(rs.Fields(fNameField).Value, "") & " " & Nz(rs.Fields(lNameField).Value, "")
                bestCloseScore = firstSim
            End If
        ElseIf StringSimilarity(inputLast, existLast) > 0.85 Then
            If cleanFirst = inputFirst And StringSimilarity(inputLast, existLast) > bestCloseScore Then
                matchType = "CLOSE"
                matchName = Nz(rs.Fields(fNameField).Value, "") & " " & Nz(rs.Fields(lNameField).Value, "")
                bestCloseScore = StringSimilarity(inputLast, existLast)
            End If
        End If
NextRow:
        rs.MoveNext
    Loop
    
MatchFound:
    rs.Close: Set rs = Nothing: Set db = Nothing: Set nickMap = Nothing
    
    Select Case matchType
        Case "EXACT"
            If silentMode Then
                CheckForDuplicateInTable = False
            Else
                CheckForDuplicateInTable = (MsgBox("DUPLICATE: " & newFirst & " " & newLast & _
                    " matches " & matchName & vbCrLf & "Add anyway?", vbYesNo + vbExclamation) = vbYes)
            End If
        Case "NICKNAME"
            If silentMode Then
                CheckForDuplicateInTable = False
            Else
                CheckForDuplicateInTable = (MsgBox("NICKNAME MATCH: " & newFirst & " " & newLast & _
                    " may be " & matchName & vbCrLf & "Add anyway?", vbYesNo + vbQuestion) = vbYes)
            End If
        Case "CLOSE"
            If silentMode Then
                CheckForDuplicateInTable = True
            Else
                CheckForDuplicateInTable = (MsgBox("SIMILAR: " & newFirst & " " & newLast & _
                    " looks like " & matchName & vbCrLf & "Add anyway?", vbYesNo + vbQuestion) = vbYes)
            End If
        Case Else
            CheckForDuplicateInTable = True
    End Select
    Exit Function
ErrHandler:
    CheckForDuplicateInTable = True
End Function

' ============================================================
' StringSimilarity - Dice coefficient
' ============================================================
Public Function StringSimilarity(ByVal s1 As String, ByVal s2 As String) As Double
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
' RunDuplicateReport
' ============================================================
Public Function RunDuplicateReport() As String
    On Error GoTo ErrHandler
    If Not TableExists(TABLE_NAME) Then
        RunDuplicateReport = "Table not found. Admin needs to open DB first.": Exit Function
    End If
    
    Dim db As DAO.Database, rs As DAO.Recordset
    Set db = CurrentDb
    Set rs = db.OpenRecordset("SELECT [L NAME], [F NAME] FROM [" & TABLE_NAME & "]", dbOpenSnapshot)
    
    Dim names() As String, nameCount As Long
    Do While Not rs.EOF
        Dim fn As String, ln As String
        ln = Trim(Nz(rs.Fields("L NAME").Value, ""))
        fn = Trim(Nz(rs.Fields("F NAME").Value, ""))
        If Len(ln) > 0 And Len(fn) > 0 Then
            ReDim Preserve names(nameCount)
            names(nameCount) = fn & "|" & ln
            nameCount = nameCount + 1
        End If
        rs.MoveNext
    Loop
    rs.Close
    
    Dim report As String, dupes As Long, closeM As Long
    report = "DUPLICATE REPORT - " & Format(Now, "MM/DD/YYYY") & " - " & nameCount & " names" & vbCrLf & vbCrLf
    
    Dim nickMap As Object: Set nickMap = GetNicknames()
    Dim reported As Object: Set reported = CreateObject("Scripting.Dictionary")
    
    Dim a As Long, b As Long
    For a = 0 To nameCount - 2
        Dim pA() As String: pA = Split(names(a), "|")
        Dim fA As String, lA As String
        fA = LCase(pA(0)): lA = LCase(pA(1))
        Dim cA As String: cA = Trim(Replace(Replace(fA, """", " "), "'", " "))
        Do While InStr(cA, "  ") > 0: cA = Replace(cA, "  ", " "): Loop
        
        For b = a + 1 To nameCount - 1
            Dim pB() As String: pB = Split(names(b), "|")
            Dim fB As String, lB As String
            fB = LCase(pB(0)): lB = LCase(pB(1))
            If lA <> lB And StringSimilarity(lA, lB) < 0.85 Then GoTo NextB
            
            Dim cB As String: cB = Trim(Replace(Replace(fB, """", " "), "'", " "))
            Do While InStr(cB, "  ") > 0: cB = Replace(cB, "  ", " "): Loop
            
            If cA = cB And lA = lB Then
                Dim k1 As String: k1 = cA & "|" & lA
                If Not reported.Exists(k1) Then
                    report = report & "EXACT: " & pA(0) & " " & pA(1) & vbCrLf
                    reported(k1) = True: dupes = dupes + 1
                End If
                GoTo NextB
            End If
            
            If StringSimilarity(cA, cB) > 0.7 And lA = lB Then
                Dim k2 As String: k2 = cA & "|" & cB & "|" & lA
                If Not reported.Exists(k2) Then
                    report = report & "SIMILAR: " & pA(0) & " " & pA(1) & " <-> " & pB(0) & " " & pB(1) & vbCrLf
                    reported(k2) = True: closeM = closeM + 1
                End If
            End If
            
            Dim aParts() As String, bParts() As String
            aParts = Split(cA, " "): bParts = Split(cB, " ")
            Dim nf As Boolean: nf = False
            Dim x As Long, y As Long
            For x = 0 To UBound(aParts)
                If nickMap.Exists(aParts(x)) Then
                    Dim aNk As Variant: aNk = Split(nickMap(aParts(x)), ",")
                    Dim z As Long
                    For z = 0 To UBound(aNk)
                        For y = 0 To UBound(bParts)
                            If Trim(aNk(z)) = bParts(y) Then nf = True: Exit For
                        Next y
                        If nf Then Exit For
                    Next z
                End If
                If nf Then Exit For
            Next x
            If nf And lA = lB Then
                Dim k3 As String: k3 = "N|" & cA & "|" & cB & "|" & lA
                If Not reported.Exists(k3) Then
                    report = report & "NICKNAME: " & pA(0) & " " & pA(1) & " <-> " & pB(0) & " " & pB(1) & vbCrLf
                    reported(k3) = True: closeM = closeM + 1
                End If
            End If
NextB:
        Next b
    Next a
    
    report = report & vbCrLf & "Exact: " & dupes & "  Similar/Nick: " & closeM
    Debug.Print report
    RunDuplicateReport = report
    MsgBox "Done. Exact: " & dupes & "  Similar: " & closeM & vbCrLf & "Details in Ctrl+G", vbInformation
    Exit Function
ErrHandler:
    RunDuplicateReport = "Error: " & Err.Description
End Function

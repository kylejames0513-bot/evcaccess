Attribute VB_Name = "Module1"
' ============================================================
' EVC Training Access - Auto Import from Supabase (v5)
' ============================================================
' MIGRATED FROM GOOGLE SHEETS CSV TO SUPABASE REST API
' ============================================================
' How it works:
'   - AutoExec calls ImportTrainingAccess() on every open
'   - Checks Windows username against ADMIN_USERNAME
'   - If admin: fetches fresh data from Supabase, imports into table
'   - If anyone else: does nothing, uses existing table data
'   - No HTTP calls on non-admin machines = no freezing
'
' SETUP:
' 1. Set ADMIN_USERNAME to your Windows username
' 2. Set SUPABASE_URL to your Supabase project URL
' 3. Set SUPABASE_ANON_KEY to your Supabase anon key
' 4. AutoExec macro: RunCode > ImportTrainingAccess()
' ============================================================

Option Compare Database
Option Explicit

' ============================================================
' CONFIGURATION
' ============================================================
Private Const ADMIN_USERNAME As String = "kyle.mahoney"

' Supabase REST API configuration
Private Const SUPABASE_URL As String = "YOUR_SUPABASE_URL"
Private Const SUPABASE_ANON_KEY As String = "YOUR_SUPABASE_ANON_KEY"

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

    ' Admin: fetch from Supabase and import
    Dim jsonData As String
    jsonData = FetchFromSupabase(SUPABASE_URL & "/rest/v1/employee_compliance?select=*")

    If Len(jsonData) = 0 Then
        MsgBox "Could not fetch from Supabase." & vbCrLf & _
               "Opening with previous data.", _
               vbExclamation, "Import Notice"
        ImportTrainingAccess = False
        Exit Function
    End If

    If TableExists(TABLE_NAME) Then
        DoCmd.DeleteObject acTable, TABLE_NAME
    End If

    ImportJSONToTable jsonData, TABLE_NAME

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
    Dim jsonData As String
    jsonData = FetchFromSupabase(SUPABASE_URL & "/rest/v1/employee_compliance?select=*")

    If Len(jsonData) = 0 Then
        MsgBox "Fetch failed.", vbExclamation, "Import"
        ManualImport = False
        Exit Function
    End If

    If TableExists(TABLE_NAME) Then
        DoCmd.DeleteObject acTable, TABLE_NAME
    End If

    ImportJSONToTable jsonData, TABLE_NAME

    MsgBox "Import successful! Rows: " & DCount("*", TABLE_NAME), _
           vbInformation, "Import"
    ManualImport = True
End Function

' ============================================================
' Fetch data from Supabase REST API
' ============================================================
Private Function FetchFromSupabase(ByVal sURL As String) As String
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

    ' Supabase requires apikey header
    oHTTP.SetRequestHeader "apikey", SUPABASE_ANON_KEY
    oHTTP.SetRequestHeader "Authorization", "Bearer " & SUPABASE_ANON_KEY
    oHTTP.SetRequestHeader "Accept", "application/json"

    oHTTP.Send
    If Err.Number <> 0 Then
        Err.Clear
        Set oHTTP = Nothing
        GoTo TryMethod2
    End If

    If oHTTP.Status = 200 Then
        FetchFromSupabase = oHTTP.responseText
        Set oHTTP = Nothing
        Exit Function
    End If
    Set oHTTP = Nothing

TryMethod2:
    Err.Clear

    Dim oHTTP2 As Object
    Set oHTTP2 = CreateObject("MSXML2.ServerXMLHTTP.6.0")
    If Err.Number <> 0 Then
        Err.Clear
        GoTo FetchFailed
    End If

    oHTTP2.setOption 2, 13056
    oHTTP2.setTimeouts 10000, 10000, 10000, 20000
    oHTTP2.Open "GET", sURL, False
    If Err.Number <> 0 Then
        Err.Clear
        Set oHTTP2 = Nothing
        GoTo FetchFailed
    End If

    oHTTP2.SetRequestHeader "apikey", SUPABASE_ANON_KEY
    oHTTP2.SetRequestHeader "Authorization", "Bearer " & SUPABASE_ANON_KEY
    oHTTP2.SetRequestHeader "Accept", "application/json"

    oHTTP2.Send
    If Err.Number <> 0 Then
        Err.Clear
        Set oHTTP2 = Nothing
        GoTo FetchFailed
    End If

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

' ============================================================
' Import JSON array into an Access table
' Uses ScriptControl to parse JSON
' ============================================================
Private Sub ImportJSONToTable(ByVal jsonStr As String, ByVal sTable As String)
    Dim db As Object
    Set db = CurrentDb

    ' Use ScriptControl to parse JSON
    Dim sc As Object
    Set sc = CreateObject("ScriptControl")
    sc.Language = "JScript"

    ' Parse the JSON array
    sc.AddCode "function getLength(arr) { return arr.length; }"
    sc.AddCode "function getItem(arr, i) { return arr[i]; }"
    sc.AddCode "function getKeys(obj) { return Object.keys(obj).join('|'); }"
    sc.AddCode "function getValue(obj, key) { var v = obj[key]; return (v === null || v === undefined) ? '' : String(v); }"

    Dim jsonArray As Object
    Set jsonArray = sc.Eval("(" & jsonStr & ")")

    Dim arrLen As Long
    arrLen = sc.Run("getLength", jsonArray)
    If arrLen = 0 Then Exit Sub

    ' Get column names from first object
    Dim firstItem As Object
    Set firstItem = sc.Run("getItem", jsonArray, 0)
    Dim keyStr As String
    keyStr = sc.Run("getKeys", firstItem)
    Dim keys() As String
    keys = Split(keyStr, "|")

    ' Create table
    Dim sSQL As String
    sSQL = "CREATE TABLE [" & sTable & "] ("
    Dim k As Long
    For k = 0 To UBound(keys)
        Dim colName As String
        colName = Replace(Replace(Replace(keys(k), "/", "_"), "\", "_"), ".", "_")
        If k > 0 Then sSQL = sSQL & ", "
        sSQL = sSQL & "[" & colName & "] TEXT(255)"
    Next k
    sSQL = sSQL & ")"
    db.Execute sSQL

    ' Insert rows
    Dim i As Long
    For i = 0 To arrLen - 1
        Dim item As Object
        Set item = sc.Run("getItem", jsonArray, i)

        sSQL = "INSERT INTO [" & sTable & "] VALUES ("
        For k = 0 To UBound(keys)
            If k > 0 Then sSQL = sSQL & ", "
            Dim val As String
            val = sc.Run("getValue", item, keys(k))
            val = Replace(val, "'", "''")
            sSQL = sSQL & "'" & val & "'"
        Next k
        sSQL = sSQL & ")"

        On Error Resume Next
        db.Execute sSQL
        If Err.Number <> 0 Then Err.Clear
        On Error GoTo 0
    Next i

    Set sc = Nothing
    Set db = Nothing
End Sub

' ============================================================
' Fetch nicknames from Supabase (replaces hardcoded dictionary)
' ============================================================
Private Function GetNicknames() As Object
    Dim d As Object
    Set d = CreateObject("Scripting.Dictionary")
    d.CompareMode = vbTextCompare

    ' Try to fetch from Supabase nicknames table
    Dim jsonData As String
    jsonData = FetchFromSupabase(SUPABASE_URL & "/rest/v1/nicknames?select=name,alias")

    If Len(jsonData) > 2 Then
        ' Parse nickname JSON
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
        ' Fallback: hardcoded nicknames if Supabase is unreachable
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
        d("frankie") = "niyonyishu": d("niyonyishu") = "frankie"
        d("jamie") = "everette": d("everette") = "jamie"
    End If

    Set GetNicknames = d
End Function

' ============================================================
' CheckForDuplicateInTable (unchanged logic, uses new nickname source)
' ============================================================
Public Function CheckForDuplicateInTable( _
    ByVal newFirst As String, _
    ByVal newLast As String, _
    Optional ByVal targetTable As String = "", _
    Optional ByVal lNameField As String = "last_name", _
    Optional ByVal fNameField As String = "first_name", _
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
' StringSimilarity - Dice coefficient (unchanged)
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
' RunDuplicateReport (unchanged logic)
' ============================================================
Public Function RunDuplicateReport() As String
    On Error GoTo ErrHandler
    If Not TableExists(TABLE_NAME) Then
        RunDuplicateReport = "Table not found. Admin needs to open DB first.": Exit Function
    End If

    Dim db As DAO.Database, rs As DAO.Recordset
    Set db = CurrentDb
    Set rs = db.OpenRecordset("SELECT [last_name], [first_name] FROM [" & TABLE_NAME & "]", dbOpenSnapshot)

    Dim names() As String, nameCount As Long
    Do While Not rs.EOF
        Dim fn As String, ln As String
        ln = Trim(Nz(rs.Fields("last_name").Value, ""))
        fn = Trim(Nz(rs.Fields("first_name").Value, ""))
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

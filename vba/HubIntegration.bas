' ============================================================
' HR Hub Integration — Monthly New Hire Tracker
' ============================================================
' Pulls training status from the HR Hub (Supabase) and
' populates the CPR/FA, Med Cert, UKERU, Mealtime columns.
' Also pushes new hires to the Hub pipeline.
'
' SETUP:
'   1. Open your Monthly New Hire Tracker.xlsm
'   2. Alt+F11 to open VBA editor
'   3. Insert → Module
'   4. Paste this entire file
'   5. Update HUB_URL if your Vercel URL is different
'   6. Close VBA editor
'   7. Use the "HR Hub" menu that appears in the ribbon
' ============================================================

Option Explicit

' ── Your Vercel deployment URL ──
' Change this if your URL is different
Private Const HUB_URL As String = "https://evcaccess.vercel.app/api/vba"

' ── Column positions on monthly sheets (1-indexed) ──
' Row 4 is the header row. Adjust if your layout changes.
Private Const COL_NUM As Long = 1        ' A: #
Private Const COL_DEPT As Long = 2       ' B: Dept
Private Const COL_LAST As Long = 3       ' C: Last Name
Private Const COL_FIRST As Long = 4      ' D: First Name
Private Const COL_BKGRD As Long = 5      ' E: Bkgrd
Private Const COL_DOH As Long = 6        ' F: DOH (Date of Hire)
Private Const COL_LOCATION As Long = 7   ' G: Location / Title
Private Const COL_ASSIGNED As Long = 8   ' H: Assigned
Private Const COL_RELIAS As Long = 9     ' I: Relias
Private Const COL_3PHASE As Long = 10    ' J: 3 Phase
Private Const COL_JOBDESC As Long = 11   ' K: Job Desc
Private Const COL_CPR As Long = 12       ' L: CPR/FA
Private Const COL_MED As Long = 13       ' M: Med Cert
Private Const COL_UKERU As Long = 14     ' N: UKERU
Private Const COL_MEALTIME As Long = 15  ' O: Mealtime
Private Const COL_THERAPY As Long = 16   ' P: Therapy
Private Const COL_ITSP As Long = 17      ' Q: ITSP
Private Const COL_DELEGATION As Long = 18 ' R: Delegation
Private Const COL_STATUS As Long = 19    ' S: Status

' New hire data rows: 5-29, Transfer rows: 34-58
Private Const NH_START As Long = 5
Private Const NH_END As Long = 29
Private Const TR_START As Long = 34
Private Const TR_END As Long = 58

' ============================================================
' AUTO-MENU: Creates "HR Hub" menu when workbook opens
' ============================================================
' Put this in ThisWorkbook module (not here):
'   Private Sub Workbook_Open()
'       CreateHubMenu
'   End Sub

Public Sub CreateHubMenu()
    On Error Resume Next
    Application.CommandBars("Worksheet Menu Bar").Controls("HR Hub").Delete
    On Error GoTo 0

    Dim menuBar As CommandBar
    Set menuBar = Application.CommandBars("Worksheet Menu Bar")

    Dim hubMenu As CommandBarPopup
    Set hubMenu = menuBar.Controls.Add(Type:=msoControlPopup, Temporary:=True)
    hubMenu.Caption = "HR Hub"

    Dim btn As CommandBarButton

    Set btn = hubMenu.Controls.Add(Type:=msoControlButton)
    btn.Caption = "Pull Trainings for This Sheet"
    btn.OnAction = "PullTrainingsForSheet"
    btn.FaceId = 271

    Set btn = hubMenu.Controls.Add(Type:=msoControlButton)
    btn.Caption = "Pull Trainings for ALL Months"
    btn.OnAction = "PullTrainingsAllMonths"
    btn.FaceId = 277

    Set btn = hubMenu.Controls.Add(Type:=msoControlButton)
    btn.Caption = "Push New Hires to Hub"
    btn.OnAction = "PushNewHiresToHub"
    btn.FaceId = 297

    Set btn = hubMenu.Controls.Add(Type:=msoControlButton)
    btn.Caption = "Push Completions to Hub"
    btn.OnAction = "PushCompletionsToHub"
    btn.FaceId = 162

    Set btn = hubMenu.Controls.Add(Type:=msoControlButton)
    btn.Caption = "---"
    btn.Enabled = False

    Set btn = hubMenu.Controls.Add(Type:=msoControlButton)
    btn.Caption = "Test Connection"
    btn.OnAction = "TestHubConnection"
    btn.FaceId = 487
End Sub

' ============================================================
' TEST CONNECTION
' ============================================================
Public Sub TestHubConnection()
    Dim resp As String
    resp = HttpGet(HUB_URL & "?action=listTrainings")

    If Left(resp, 5) = "ERROR" Then
        MsgBox "Connection failed:" & vbNewLine & vbNewLine & resp, vbCritical, "HR Hub"
    Else
        Dim trainCount As Long
        trainCount = CountOccurrences(resp, """code""")
        MsgBox "Connected to HR Hub." & vbNewLine & _
               trainCount & " active trainings found.", vbInformation, "HR Hub"
    End If
End Sub

' ============================================================
' PULL TRAININGS — populate training columns from Hub data
' ============================================================

' Pull for the active monthly sheet
Public Sub PullTrainingsForSheet()
    If Not IsMonthSheet(ActiveSheet.Name) Then
        MsgBox "This doesn't look like a monthly sheet. Navigate to January-December first.", vbExclamation, "HR Hub"
        Exit Sub
    End If

    Application.ScreenUpdating = False
    Dim updated As Long
    updated = PullTrainingsForRange(ActiveSheet, NH_START, NH_END)
    updated = updated + PullTrainingsForRange(ActiveSheet, TR_START, TR_END)
    Application.ScreenUpdating = True

    MsgBox "Done. Updated " & updated & " employee(s) on " & ActiveSheet.Name & ".", vbInformation, "HR Hub"
End Sub

' Pull for all 12 monthly sheets
Public Sub PullTrainingsAllMonths()
    Dim answer As VbMsgBoxResult
    answer = MsgBox("Pull training data for all 12 monthly sheets?" & vbNewLine & _
                     "This may take a minute.", vbYesNo + vbQuestion, "HR Hub")
    If answer <> vbYes Then Exit Sub

    Application.ScreenUpdating = False
    Dim months As Variant
    months = Array("January", "February", "March", "April", "May", "June", _
                   "July", "August", "September", "October", "November", "December")

    Dim totalUpdated As Long
    Dim m As Long
    For m = 0 To 11
        Dim ws As Worksheet
        On Error Resume Next
        Set ws = ThisWorkbook.Sheets(months(m))
        On Error GoTo 0
        If Not ws Is Nothing Then
            Application.StatusBar = "Pulling trainings for " & months(m) & "..."
            totalUpdated = totalUpdated + PullTrainingsForRange(ws, NH_START, NH_END)
            totalUpdated = totalUpdated + PullTrainingsForRange(ws, TR_START, TR_END)
            Set ws = Nothing
        End If
    Next m

    Application.StatusBar = False
    Application.ScreenUpdating = True
    MsgBox "Done. Updated " & totalUpdated & " employees across all months.", vbInformation, "HR Hub"
End Sub

Private Function PullTrainingsForRange(ws As Worksheet, startRow As Long, endRow As Long) As Long
    Dim updated As Long
    Dim r As Long

    For r = startRow To endRow
        Dim lastName As String
        Dim firstName As String
        lastName = Trim(CStr(ws.Cells(r, COL_LAST).Value))
        firstName = Trim(CStr(ws.Cells(r, COL_FIRST).Value))

        If lastName <> "" And firstName <> "" Then
            Dim resp As String
            resp = HttpGet(HUB_URL & "?action=getTrainings" & _
                           "&firstName=" & UrlEncode(firstName) & _
                           "&lastName=" & UrlEncode(lastName))

            If Left(resp, 5) <> "ERROR" Then
                ' Parse and populate columns
                Dim cprStatus As String: cprStatus = ExtractJsonStatus(resp, "CPR_FA")
                Dim medStatus As String: medStatus = ExtractJsonStatus(resp, "MED_TRAIN")
                Dim ukeruStatus As String: ukeruStatus = ExtractJsonStatus(resp, "UKERU")
                Dim mealtimeStatus As String: mealtimeStatus = ExtractJsonStatus(resp, "MEALTIME")

                If cprStatus <> "" Then ws.Cells(r, COL_CPR).Value = cprStatus
                If medStatus <> "" Then ws.Cells(r, COL_MED).Value = medStatus
                If ukeruStatus <> "" Then ws.Cells(r, COL_UKERU).Value = ukeruStatus
                If mealtimeStatus <> "" Then ws.Cells(r, COL_MEALTIME).Value = mealtimeStatus

                updated = updated + 1
            End If
        End If
    Next r

    PullTrainingsForRange = updated
End Function

' ============================================================
' PUSH NEW HIRES — send new hire records to the Hub
' ============================================================
Public Sub PushNewHiresToHub()
    If Not IsMonthSheet(ActiveSheet.Name) Then
        MsgBox "Navigate to a monthly sheet first.", vbExclamation, "HR Hub"
        Exit Sub
    End If

    Application.ScreenUpdating = False
    Dim ws As Worksheet
    Set ws = ActiveSheet
    Dim pushed As Long
    Dim skipped As Long
    Dim r As Long

    For r = NH_START To NH_END
        Dim lastName As String: lastName = Trim(CStr(ws.Cells(r, COL_LAST).Value))
        Dim firstName As String: firstName = Trim(CStr(ws.Cells(r, COL_FIRST).Value))
        If lastName = "" Or firstName = "" Then GoTo NextRow

        Dim dept As String: dept = Trim(CStr(ws.Cells(r, COL_DEPT).Value))
        Dim loc As String: loc = Trim(CStr(ws.Cells(r, COL_LOCATION).Value))
        Dim doh As String
        If IsDate(ws.Cells(r, COL_DOH).Value) Then
            doh = Format(ws.Cells(r, COL_DOH).Value, "yyyy-mm-dd")
        Else
            doh = ""
        End If
        Dim status As String: status = Trim(CStr(ws.Cells(r, COL_STATUS).Value))

        ' Extract year from sheet title row (A1)
        Dim sheetYear As String
        sheetYear = ExtractYear(CStr(ws.Cells(1, 1).Value))

        Dim body As String
        body = "{" & _
            """action"":""addNewHire""," & _
            """firstName"":""" & EscapeJson(firstName) & """," & _
            """lastName"":""" & EscapeJson(lastName) & """," & _
            """department"":""" & EscapeJson(dept) & """," & _
            """position"":""" & EscapeJson(loc) & """," & _
            """hireDate"":""" & doh & """," & _
            """startDate"":""" & doh & """," & _
            """month"":""" & ws.Name & """," & _
            """year"":" & IIf(sheetYear <> "", sheetYear, "null") & _
        "}"

        Dim resp As String
        resp = HttpPost(HUB_URL, body)

        If InStr(resp, """ok"":true") > 0 Then
            pushed = pushed + 1
        Else
            skipped = skipped + 1
            Debug.Print "Push failed for " & lastName & ", " & firstName & ": " & resp
        End If
NextRow:
    Next r

    Application.ScreenUpdating = True
    MsgBox "Pushed " & pushed & " new hire(s) to the Hub." & _
           IIf(skipped > 0, vbNewLine & skipped & " skipped (check Immediate window).", ""), _
           vbInformation, "HR Hub"
End Sub

' ============================================================
' PUSH COMPLETIONS — send Yes/No/N/A training status to Hub
' ============================================================
Public Sub PushCompletionsToHub()
    If Not IsMonthSheet(ActiveSheet.Name) Then
        MsgBox "Navigate to a monthly sheet first.", vbExclamation, "HR Hub"
        Exit Sub
    End If

    Application.ScreenUpdating = False
    Dim ws As Worksheet
    Set ws = ActiveSheet
    Dim logged As Long
    Dim r As Long

    ' Process new hires and transfers
    Dim ranges As Variant
    ranges = Array(Array(NH_START, NH_END), Array(TR_START, TR_END))

    Dim rng As Variant
    For Each rng In ranges
        For r = rng(0) To rng(1)
            Dim lastName As String: lastName = Trim(CStr(ws.Cells(r, COL_LAST).Value))
            Dim firstName As String: firstName = Trim(CStr(ws.Cells(r, COL_FIRST).Value))
            If lastName = "" Or firstName = "" Then GoTo NextCompRow

            Dim doh As String
            If IsDate(ws.Cells(r, COL_DOH).Value) Then
                doh = Format(ws.Cells(r, COL_DOH).Value, "yyyy-mm-dd")
            Else
                doh = Format(Date, "yyyy-mm-dd")
            End If

            ' Push each training column
            logged = logged + PushOneCompletion(firstName, lastName, "CPR_FA", CStr(ws.Cells(r, COL_CPR).Value), doh)
            logged = logged + PushOneCompletion(firstName, lastName, "MED_TRAIN", CStr(ws.Cells(r, COL_MED).Value), doh)
            logged = logged + PushOneCompletion(firstName, lastName, "UKERU", CStr(ws.Cells(r, COL_UKERU).Value), doh)
            logged = logged + PushOneCompletion(firstName, lastName, "MEALTIME", CStr(ws.Cells(r, COL_MEALTIME).Value), doh)
NextCompRow:
        Next r
    Next rng

    Application.ScreenUpdating = True
    MsgBox "Logged " & logged & " completion(s) to the Hub.", vbInformation, "HR Hub"
End Sub

Private Function PushOneCompletion(firstName As String, lastName As String, _
                                    trainingCode As String, cellValue As String, _
                                    completionDate As String) As Long
    Dim val As String
    val = Trim(cellValue)
    If val = "" Or val = "0" Then
        PushOneCompletion = 0
        Exit Function
    End If

    ' Map cell values to Hub status
    Dim status As String
    Select Case UCase(val)
        Case "YES", "Y", "PASS", "PASSED", "COMPLETE", "COMPLETED"
            status = "compliant"
        Case "NO", "N", "FAIL", "FAILED"
            status = "failed"
        Case "N/A", "NA", "EXEMPT"
            status = "N/A"
        Case "IN PROGRESS", "PENDING", "SCHEDULED"
            PushOneCompletion = 0
            Exit Function
        Case Else
            ' If it's a date, treat as compliant with that date
            If IsDate(val) Then
                completionDate = Format(CDate(val), "yyyy-mm-dd")
                status = "compliant"
            Else
                status = "compliant"
            End If
    End Select

    Dim body As String
    body = "{" & _
        """action"":""logCompletion""," & _
        """firstName"":""" & EscapeJson(firstName) & """," & _
        """lastName"":""" & EscapeJson(lastName) & """," & _
        """trainingCode"":""" & trainingCode & """," & _
        """date"":""" & completionDate & """," & _
        """status"":""" & status & """" & _
    "}"

    Dim resp As String
    resp = HttpPost(HUB_URL, body)

    If InStr(resp, """ok"":true") > 0 Then
        PushOneCompletion = 1
    Else
        Debug.Print "Completion failed: " & lastName & " " & trainingCode & " -> " & resp
        PushOneCompletion = 0
    End If
End Function

' ============================================================
' HTTP HELPERS
' ============================================================
Private Function HttpGet(url As String) As String
    On Error GoTo ErrHandler
    Dim http As Object
    Set http = CreateObject("MSXML2.XMLHTTP")
    http.Open "GET", url, False
    http.send

    If http.status >= 200 And http.status < 300 Then
        HttpGet = http.responseText
    Else
        HttpGet = "ERROR " & http.status & ": " & http.responseText
    End If
    Exit Function
ErrHandler:
    HttpGet = "ERROR: " & Err.Description
End Function

Private Function HttpPost(url As String, body As String) As String
    On Error GoTo ErrHandler
    Dim http As Object
    Set http = CreateObject("MSXML2.XMLHTTP")
    http.Open "POST", url, False
    http.setRequestHeader "Content-Type", "application/json"
    http.send body

    If http.status >= 200 And http.status < 300 Then
        HttpPost = http.responseText
    Else
        HttpPost = "ERROR " & http.status & ": " & http.responseText
    End If
    Exit Function
ErrHandler:
    HttpPost = "ERROR: " & Err.Description
End Function

' ============================================================
' STRING HELPERS
' ============================================================
Private Function UrlEncode(str As String) As String
    Dim i As Long
    Dim result As String
    For i = 1 To Len(str)
        Dim c As String
        c = Mid(str, i, 1)
        Select Case c
            Case "A" To "Z", "a" To "z", "0" To "9", "-", "_", ".", "~"
                result = result & c
            Case " "
                result = result & "%20"
            Case Else
                result = result & "%" & Right("0" & Hex(Asc(c)), 2)
        End Select
    Next i
    UrlEncode = result
End Function

Private Function EscapeJson(str As String) As String
    Dim result As String
    result = Replace(str, "\", "\\")
    result = Replace(result, """", "\""")
    result = Replace(result, vbCr, "")
    result = Replace(result, vbLf, "")
    result = Replace(result, vbTab, " ")
    EscapeJson = result
End Function

Private Function ExtractJsonStatus(json As String, code As String) As String
    Dim pattern As String
    pattern = """" & code & """:{""status"":"""
    Dim pos As Long
    pos = InStr(json, pattern)
    If pos = 0 Then
        ExtractJsonStatus = ""
        Exit Function
    End If
    pos = pos + Len(pattern)
    Dim endPos As Long
    endPos = InStr(pos, json, """")
    If endPos = 0 Then
        ExtractJsonStatus = ""
        Exit Function
    End If
    ExtractJsonStatus = Mid(json, pos, endPos - pos)
End Function

Private Function ExtractYear(title As String) As String
    ' Extract 4-digit year from title like "January 2026 — New Hires & Transfers"
    Dim i As Long
    For i = 1 To Len(title) - 3
        Dim chunk As String
        chunk = Mid(title, i, 4)
        If chunk Like "20##" Then
            ExtractYear = chunk
            Exit Function
        End If
    Next i
    ExtractYear = ""
End Function

Private Function CountOccurrences(str As String, find As String) As Long
    Dim count As Long
    Dim pos As Long
    pos = 1
    Do
        pos = InStr(pos, str, find)
        If pos = 0 Then Exit Do
        count = count + 1
        pos = pos + Len(find)
    Loop
    CountOccurrences = count
End Function

Private Function IsMonthSheet(name As String) As Boolean
    Select Case name
        Case "January", "February", "March", "April", "May", "June", _
             "July", "August", "September", "October", "November", "December"
            IsMonthSheet = True
        Case Else
            IsMonthSheet = False
    End Select
End Function

' ============================================================
' Paste this into the ThisWorkbook module of your XLSM
' (NOT a regular module — double-click "ThisWorkbook" in VBA editor)
' ============================================================
' This auto-creates the "HR Hub" menu when the workbook opens.

Private Sub Workbook_Open()
    CreateHubMenu
End Sub

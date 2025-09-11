; Custom NSIS installer script for Restaurant Management System

; Check if the application is already running and offer to close it
!macro customInit
  ; Check if Restaurant Manager is running
  FindWindow $0 "" "Restaurant Manager"
  IntCmp $0 0 notRunning
    MessageBox MB_OKCANCEL|MB_ICONEXCLAMATION \
      "Restaurant Manager is currently running. Please close it before continuing with the installation." \
      /SD IDCANCEL IDOK notRunning
    Abort
  notRunning:
!macroend

; Custom welcome page text
!macro customWelcomePage
  !insertmacro MUI_PAGE_WELCOME
  !define MUI_WELCOMEPAGE_TITLE "Welcome to Restaurant Manager Setup"
  !define MUI_WELCOMEPAGE_TEXT "This wizard will guide you through the installation of Restaurant Manager, a complete restaurant management system.$\r$\n$\r$\nRestaurant Manager includes:$\r$\n• Point of Sale (POS) terminal$\r$\n• Kitchen Display System$\r$\n• Customer monitoring$\r$\n• Administrative analytics$\r$\n• Real-time order tracking$\r$\n$\r$\nClick Next to continue."
!macroend

; Custom directory page
!macro customDirectoryPage
  !define MUI_DIRECTORYPAGE_TEXT_TOP "Select the folder where you want to install Restaurant Manager.$\r$\n$\r$\nRecommended minimum free space: 500 MB"
!macroend

; Custom installation page
!macro customInstallPage
  !define MUI_INSTFILESPAGE_FINISHHEADER_TEXT "Installation Complete"
  !define MUI_INSTFILESPAGE_FINISHHEADER_SUBTEXT "Restaurant Manager has been successfully installed."
!macroend

; Pre-installation checks and setup
!macro customPreInstall
  ; Check Windows version compatibility
  ${If} ${AtMostWinVista}
    MessageBox MB_OK|MB_ICONSTOP "Restaurant Manager requires Windows 7 or later."
    Abort
  ${EndIf}
  
  ; Check available disk space (500 MB minimum)
  ${GetRoot} "$INSTDIR" $0
  ${DriveSpace} "$0\" "/D=F /S=M" $1
  IntCmp $1 500 okay okay
    MessageBox MB_OK|MB_ICONSTOP "Insufficient disk space. At least 500 MB is required."
    Abort
  okay:
  
  ; Create application data directory
  CreateDirectory "$APPDATA\RestaurantManager"
  CreateDirectory "$APPDATA\RestaurantManager\logs"
  CreateDirectory "$APPDATA\RestaurantManager\backups"
!macroend

; Post-installation tasks
!macro customInstall
  ; Create additional shortcuts
  CreateShortCut "$DESKTOP\Restaurant Manager.lnk" "$INSTDIR\RestaurantManager.exe" "" "$INSTDIR\RestaurantManager.exe" 0
  
  ; Create Start Menu folder and shortcuts
  CreateDirectory "$SMPROGRAMS\Restaurant Manager"
  CreateShortCut "$SMPROGRAMS\Restaurant Manager\Restaurant Manager.lnk" "$INSTDIR\RestaurantManager.exe" "" "$INSTDIR\RestaurantManager.exe" 0
  CreateShortCut "$SMPROGRAMS\Restaurant Manager\Uninstall.lnk" "$INSTDIR\Uninstall Restaurant Manager.exe" "" "$INSTDIR\Uninstall Restaurant Manager.exe" 0
  
  ; Register file associations
  WriteRegStr HKCR ".rmenu" "" "RestaurantManager.MenuFile"
  WriteRegStr HKCR "RestaurantManager.MenuFile" "" "Restaurant Menu File"
  WriteRegStr HKCR "RestaurantManager.MenuFile\DefaultIcon" "" "$INSTDIR\RestaurantManager.exe,1"
  WriteRegStr HKCR "RestaurantManager.MenuFile\shell\open\command" "" '"$INSTDIR\RestaurantManager.exe" "%1"'
  
  ; Register application in Windows registry
  WriteRegStr HKLM "SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\RestaurantManager" "DisplayName" "Restaurant Manager"
  WriteRegStr HKLM "SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\RestaurantManager" "Publisher" "Restaurant Management System"
  WriteRegStr HKLM "SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\RestaurantManager" "DisplayVersion" "${VERSION}"
  WriteRegStr HKLM "SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\RestaurantManager" "InstallLocation" "$INSTDIR"
  WriteRegStr HKLM "SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\RestaurantManager" "UninstallString" "$INSTDIR\Uninstall Restaurant Manager.exe"
  WriteRegDWORD HKLM "SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\RestaurantManager" "NoModify" 1
  WriteRegDWORD HKLM "SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\RestaurantManager" "NoRepair" 1
  
  ; Register UDP discovery port in Windows Firewall (if available)
  nsExec::ExecToLog 'netsh advfirewall firewall add rule name="Restaurant Manager - UDP Discovery" dir=in action=allow protocol=UDP localport=44201'
  Pop $0 ; Exit code
  
  ; Set up Windows service for background operation (optional)
  ; This allows the server to run as a Windows service
  WriteRegStr HKLM "SOFTWARE\Microsoft\Windows\CurrentVersion\Run" "RestaurantManagerService" '"$INSTDIR\RestaurantManager.exe" --background'
!macroend

; Pre-uninstallation cleanup
!macro customUnInit
  ; Check if the application is running and offer to close it
  FindWindow $0 "" "Restaurant Manager"
  IntCmp $0 0 notRunning
    MessageBox MB_OKCANCEL|MB_ICONQUESTION \
      "Restaurant Manager is currently running. It will be closed automatically.$\r$\n$\r$\nDo you want to continue?" \
      /SD IDCANCEL IDOK closeApp
    Abort
  closeApp:
    SendMessage $0 ${WM_CLOSE} 0 0
    Sleep 2000
  notRunning:
!macroend

; Uninstallation cleanup
!macro customUnInstall
  ; Remove shortcuts
  Delete "$DESKTOP\Restaurant Manager.lnk"
  Delete "$SMPROGRAMS\Restaurant Manager\Restaurant Manager.lnk"
  Delete "$SMPROGRAMS\Restaurant Manager\Uninstall.lnk"
  RMDir "$SMPROGRAMS\Restaurant Manager"
  
  ; Remove file associations
  DeleteRegKey HKCR ".rmenu"
  DeleteRegKey HKCR "RestaurantManager.MenuFile"
  
  ; Remove registry entries
  DeleteRegKey HKLM "SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\RestaurantManager"
  DeleteRegValue HKLM "SOFTWARE\Microsoft\Windows\CurrentVersion\Run" "RestaurantManagerService"
  DeleteRegKey HKLM "SOFTWARE\RestaurantManager"
  
  ; Remove firewall rules
  nsExec::ExecToLog 'netsh advfirewall firewall delete rule name="Restaurant Manager - UDP Discovery"'
  Pop $0
  
  ; Ask user if they want to keep application data
  MessageBox MB_YESNO|MB_ICONQUESTION \
    "Do you want to keep your restaurant data and settings?$\r$\n$\r$\nSelect 'No' to remove all data (this cannot be undone)." \
    /SD IDYES IDYES keepData
    
  ; Remove application data if user chose to
  RMDir /r "$APPDATA\RestaurantManager"
  
  keepData:
  
  ; Refresh shell icons
  System::Call 'shell32.dll::SHChangeNotify(l, l, i, i) v (0x08000000, 0, 0, 0)'
!macroend

; Custom finish page
!macro customFinishPage
  !define MUI_FINISHPAGE_TITLE "Restaurant Manager Installation Complete"
  !define MUI_FINISHPAGE_TEXT "Restaurant Manager has been successfully installed on your computer.$\r$\n$\r$\nThe application is now ready to use for managing your restaurant operations.$\r$\n$\r$\nClick Finish to close this wizard."
  !define MUI_FINISHPAGE_RUN "$INSTDIR\RestaurantManager.exe"
  !define MUI_FINISHPAGE_RUN_TEXT "Launch Restaurant Manager now"
  !define MUI_FINISHPAGE_SHOWREADME "$INSTDIR\README.txt"
  !define MUI_FINISHPAGE_SHOWREADME_TEXT "Show README file"
!macroend

; Error handling
!macro customError
  MessageBox MB_OK|MB_ICONSTOP "An error occurred during installation. Please check the installation log and try again."
!macroend
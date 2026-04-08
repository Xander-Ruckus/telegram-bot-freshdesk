; Inno Setup Script for Telegram Bot - Freshdesk Integration
; Download Inno Setup from: https://jrsoftware.org/isinfo.php
; Compile this file with Inno Setup to create the installer .exe

#define MyAppName "Telegram Bot Freshdesk"
#define MyAppVersion "1.0.0"
#define MyAppPublisher "Telegram Bot"
#define MyAppExeName "telegram-bot-freshdesk.exe"
#define MyMonitorExeName "service-monitor.exe"

[Setup]
AppId={{A1B2C3D4-E5F6-7890-ABCD-EF1234567890}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
DefaultDirName={autopf}\{#MyAppName}
DefaultGroupName={#MyAppName}
AllowNoIcons=yes
OutputDir=installer-output
OutputBaseFilename=TelegramBotFreshdesk-Setup-{#MyAppVersion}
Compression=lzma2/ultra64
SolidCompression=yes
WizardStyle=modern
PrivilegesRequired=admin
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
SetupLogging=yes
UninstallDisplayName={#MyAppName}

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "Create a &desktop shortcut"; GroupDescription: "Additional shortcuts:"
Name: "autostart"; Description: "Start automatically with Windows"; GroupDescription: "Startup options:"
Name: "startservice"; Description: "Start the bot after installation"; GroupDescription: "Startup options:"

[Files]
; Main executables
Source: "dist\telegram-bot-freshdesk.exe"; DestDir: "{app}"; Flags: ignoreversion
Source: "dist\service-monitor.exe"; DestDir: "{app}"; Flags: ignoreversion

; Native modules (sqlite3)
Source: "dist\node_modules\*"; DestDir: "{app}\node_modules"; Flags: ignoreversion recursesubdirs createallsubdirs

; Launcher scripts
Source: "dist\start-bot.bat"; DestDir: "{app}"; Flags: ignoreversion
Source: "dist\start-monitor.bat"; DestDir: "{app}"; Flags: ignoreversion
Source: "dist\start-all.bat"; DestDir: "{app}"; Flags: ignoreversion

; Configuration
Source: "dist\.env.example"; DestDir: "{app}"; Flags: ignoreversion
Source: "dist\.env"; DestDir: "{app}"; Flags: ignoreversion onlyifdoesntexist skipifsourcedoesntexist

; Data directory (empty - will be created)
Source: "dist\data\*"; DestDir: "{app}\data"; Flags: ignoreversion skipifsourcedoesntexist recursesubdirs createallsubdirs

[Dirs]
Name: "{app}\data"; Permissions: users-modify

[Icons]
Name: "{group}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; Comment: "Start Telegram Bot"
Name: "{group}\Service Monitor"; Filename: "{app}\{#MyMonitorExeName}"; Comment: "Start Service Monitor"
Name: "{group}\Start All Services"; Filename: "{app}\start-all.bat"; Comment: "Start Bot and Monitor"
Name: "{group}\Configuration"; Filename: "{app}\.env"; Comment: "Edit Configuration"
Name: "{group}\Uninstall {#MyAppName}"; Filename: "{uninstallexe}"
Name: "{autodesktop}\{#MyAppName}"; Filename: "{app}\start-all.bat"; Tasks: desktopicon; Comment: "Start Telegram Bot Freshdesk"

[Registry]
; Auto-start with Windows (optional task)
Root: HKCU; Subkey: "Software\Microsoft\Windows\CurrentVersion\Run"; ValueType: string; ValueName: "{#MyAppName}"; ValueData: """{app}\{#MyAppExeName}"""; Flags: uninsdeletevalue; Tasks: autostart

[Run]
; Post-install: open config if .env doesn't exist
Filename: "notepad.exe"; Parameters: """{app}\.env.example"""; Description: "Configure the bot (edit .env file)"; Flags: postinstall shellexec skipifsilent; Check: NeedsConfiguration
; Post-install: optionally start the service
Filename: "{app}\start-all.bat"; Description: "Start the bot now"; Flags: postinstall nowait skipifsilent; Tasks: startservice

[UninstallRun]
; Stop any running instances before uninstall
Filename: "taskkill"; Parameters: "/F /IM {#MyAppExeName}"; Flags: runhidden; RunOnceId: "StopBot"
Filename: "taskkill"; Parameters: "/F /IM {#MyMonitorExeName}"; Flags: runhidden; RunOnceId: "StopMonitor"

[Code]
function NeedsConfiguration: Boolean;
begin
  Result := not FileExists(ExpandConstant('{app}\.env'));
end;

procedure CurStepChanged(CurStep: TSetupStep);
begin
  if CurStep = ssPostInstall then
  begin
    { Create .env from .env.example if it doesn't exist }
    if not FileExists(ExpandConstant('{app}\.env')) then
    begin
      if FileExists(ExpandConstant('{app}\.env.example')) then
        FileCopy(ExpandConstant('{app}\.env.example'), ExpandConstant('{app}\.env'), True);
    end;
  end;
end;

; Inno Setup Script for Telegram Bot - Freshdesk Integration
; Download Inno Setup from: https://jrsoftware.org/isinfo.php
; Compile this file with Inno Setup to create the installer .exe

#define MyAppName "Telegram Bot Freshdesk"
#define MyAppVersion "1.0.0"
#define MyAppPublisher "Telegram Bot"
#define MyAppExeName "telegram-bot-freshdesk.exe"
#define MyMonitorExeName "service-monitor.exe"
#define MyServiceExeName "TelFreshBotService.exe"
#define MyServiceName "Tel-Fresh-Bot"

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
Name: "installservice"; Description: "Install Windows service {#MyServiceName}"; GroupDescription: "Service options:"; Flags: checkedonce
Name: "startservice"; Description: "Start {#MyServiceName} after installation"; GroupDescription: "Service options:"; Flags: checkedonce

[Files]
; Main executables
Source: "dist\telegram-bot-freshdesk.exe"; DestDir: "{app}"; Flags: ignoreversion
Source: "dist\service-monitor.exe"; DestDir: "{app}"; Flags: ignoreversion
Source: "dist\{#MyServiceExeName}"; DestDir: "{app}"; Flags: ignoreversion

; Native modules (sqlite3)
Source: "dist\node_modules\*"; DestDir: "{app}\node_modules"; Flags: ignoreversion recursesubdirs createallsubdirs

; Launcher scripts
Source: "dist\start-bot.bat"; DestDir: "{app}"; Flags: ignoreversion
Source: "dist\start-monitor.bat"; DestDir: "{app}"; Flags: ignoreversion
Source: "dist\start-all.bat"; DestDir: "{app}"; Flags: ignoreversion
Source: "dist\install-service.bat"; DestDir: "{app}"; Flags: ignoreversion
Source: "dist\start-service.bat"; DestDir: "{app}"; Flags: ignoreversion
Source: "dist\stop-service.bat"; DestDir: "{app}"; Flags: ignoreversion
Source: "dist\remove-service.bat"; DestDir: "{app}"; Flags: ignoreversion

; Configuration
Source: "dist\.env.example"; DestDir: "{app}"; Flags: ignoreversion
Source: "dist\.env"; DestDir: "{app}"; Flags: ignoreversion onlyifdoesntexist skipifsourcedoesntexist

; Data directory (empty - will be created)
Source: "dist\data\*"; DestDir: "{app}\data"; Flags: ignoreversion skipifsourcedoesntexist recursesubdirs createallsubdirs

[Dirs]
Name: "{app}\data"; Permissions: users-modify
Name: "{app}\logs"; Permissions: users-modify

[Icons]
Name: "{group}\{#MyAppName}"; Filename: "{app}\start-all.bat"; Comment: "Start Telegram Bot services"
Name: "{group}\Service Monitor"; Filename: "{app}\{#MyMonitorExeName}"; Comment: "Start Service Monitor"
Name: "{group}\Start All Services"; Filename: "{app}\start-all.bat"; Comment: "Start monitored bot services"
Name: "{group}\Services"; Filename: "{sys}\mmc.exe"; Parameters: "services.msc"; Comment: "Manage Windows services"
Name: "{group}\Configuration"; Filename: "{app}\.env"; Comment: "Edit Configuration"
Name: "{group}\Uninstall {#MyAppName}"; Filename: "{uninstallexe}"
Name: "{autodesktop}\{#MyAppName}"; Filename: "{app}\start-all.bat"; Tasks: desktopicon; Comment: "Start Telegram Bot Freshdesk"

[Run]
; Post-install: open config if .env doesn't exist
Filename: "notepad.exe"; Parameters: """{app}\.env.example"""; Description: "Configure the bot (edit .env file)"; Flags: postinstall shellexec skipifsilent; Check: NeedsConfiguration

[UninstallRun]
; Stop any running instances before uninstall
Filename: "taskkill"; Parameters: "/F /IM {#MyAppExeName}"; Flags: runhidden; RunOnceId: "StopBot"
Filename: "taskkill"; Parameters: "/F /IM {#MyMonitorExeName}"; Flags: runhidden; RunOnceId: "StopMonitor"

[Code]
function NeedsConfiguration: Boolean;
begin
  Result := not FileExists(ExpandConstant('{app}\.env'));
end;

function ServiceExists(const ServiceName: string): Boolean;
var
  ResultCode: Integer;
begin
  Result := Exec(ExpandConstant('{sys}\sc.exe'), 'query "' + ServiceName + '"', '', SW_HIDE, ewWaitUntilTerminated, ResultCode) and (ResultCode = 0);
end;

procedure InstallWindowsService();
var
  ResultCode: Integer;
  ServiceExe: string;
begin
  ServiceExe := ExpandConstant('{app}\{#MyServiceExeName}');

  if ServiceExists('{#MyServiceName}') then
  begin
    Exec(ExpandConstant('{sys}\sc.exe'), 'stop "{#MyServiceName}"', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
    Exec(ExpandConstant('{sys}\sc.exe'), 'delete "{#MyServiceName}"', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
  end;

  if not Exec(ExpandConstant('{sys}\sc.exe'), 'create "{#MyServiceName}" binPath= """' + ServiceExe + '""" start= auto DisplayName= "{#MyServiceName}"', '', SW_HIDE, ewWaitUntilTerminated, ResultCode) or (ResultCode <> 0) then
  begin
    RaiseException('Failed to create Windows service {#MyServiceName}.');
  end;

  Exec(ExpandConstant('{sys}\sc.exe'), 'description "{#MyServiceName}" "Telegram Freshdesk bot service"', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
  Exec(ExpandConstant('{sys}\sc.exe'), 'failure "{#MyServiceName}" reset= 86400 actions= restart/5000/restart/5000/restart/5000', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
end;

procedure StartWindowsService();
var
  ResultCode: Integer;
begin
  if not Exec(ExpandConstant('{sys}\sc.exe'), 'start "{#MyServiceName}"', '', SW_HIDE, ewWaitUntilTerminated, ResultCode) then
  begin
    RaiseException('Failed to start Windows service {#MyServiceName}.');
  end;
end;

procedure RemoveWindowsService();
var
  ResultCode: Integer;
begin
  if ServiceExists('{#MyServiceName}') then
  begin
    Exec(ExpandConstant('{sys}\sc.exe'), 'stop "{#MyServiceName}"', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
    Exec(ExpandConstant('{sys}\sc.exe'), 'delete "{#MyServiceName}"', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
  end;
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

    if WizardIsTaskSelected('installservice') then
    begin
      InstallWindowsService();

      if WizardIsTaskSelected('startservice') then
        StartWindowsService();
    end;
  end;
end;

procedure CurUninstallStepChanged(CurUninstallStep: TUninstallStep);
begin
  if CurUninstallStep = usUninstall then
    RemoveWindowsService();
end;

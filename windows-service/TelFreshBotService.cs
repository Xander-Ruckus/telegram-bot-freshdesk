using System;
using System.Diagnostics;
using System.IO;
using System.ServiceProcess;
using System.Threading;

namespace TelFreshBotServiceHost
{
    internal static class Program
    {
        private static void Main(string[] args)
        {
            if (Environment.UserInteractive)
            {
                if (args.Length > 0 && string.Equals(args[0], "--console", StringComparison.OrdinalIgnoreCase))
                {
                    var service = new TelFreshBotService();
                    service.StartInteractive();

                    Console.WriteLine("Tel-Fresh-Bot running in console mode. Press Ctrl+C to stop.");

                    using (var stopEvent = new ManualResetEvent(false))
                    {
                        Console.CancelKeyPress += (_, eventArgs) =>
                        {
                            eventArgs.Cancel = true;
                            service.StopInteractive();
                            stopEvent.Set();
                        };

                        stopEvent.WaitOne();
                    }

                    return;
                }

                Console.WriteLine("Tel-Fresh-Bot Windows service host");
                Console.WriteLine("Install and manage the service through the installer or Services.msc.");
                return;
            }

            ServiceBase.Run(new ServiceBase[] { new TelFreshBotService() });
        }
    }

    public sealed class TelFreshBotService : ServiceBase
    {
        private readonly object sync = new object();
        private Process childProcess;
        private bool stopping;

        private string BaseDirectory
        {
            get { return AppDomain.CurrentDomain.BaseDirectory; }
        }

        private string MonitorPath
        {
            get { return Path.Combine(BaseDirectory, "service-monitor.exe"); }
        }

        private string LogDirectory
        {
            get { return Path.Combine(BaseDirectory, "logs"); }
        }

        private string LogPath
        {
            get { return Path.Combine(LogDirectory, "TelFreshBotService.log"); }
        }

        public TelFreshBotService()
        {
            ServiceName = "Tel-Fresh-Bot";
            CanStop = true;
            AutoLog = true;
        }

        protected override void OnStart(string[] args)
        {
            stopping = false;
            StartMonitor();
        }

        protected override void OnStop()
        {
            stopping = true;
            StopMonitor();
        }

        public void StartInteractive()
        {
            stopping = false;
            StartMonitor();
        }

        public void StopInteractive()
        {
            stopping = true;
            StopMonitor();
        }

        private void StartMonitor()
        {
            lock (sync)
            {
                if (childProcess != null && !childProcess.HasExited)
                {
                    return;
                }

                Directory.CreateDirectory(LogDirectory);

                if (!File.Exists(MonitorPath))
                {
                    AppendLog("service-monitor.exe was not found next to the service host.");
                    throw new FileNotFoundException("service-monitor.exe was not found.", MonitorPath);
                }

                var startInfo = new ProcessStartInfo
                {
                    FileName = MonitorPath,
                    WorkingDirectory = BaseDirectory,
                    UseShellExecute = false,
                    CreateNoWindow = true,
                    RedirectStandardOutput = true,
                    RedirectStandardError = true
                };

                childProcess = new Process
                {
                    StartInfo = startInfo,
                    EnableRaisingEvents = true
                };

                childProcess.OutputDataReceived += (sender, eventArgs) =>
                {
                    if (!string.IsNullOrWhiteSpace(eventArgs.Data))
                    {
                        AppendLog("OUT " + eventArgs.Data);
                    }
                };

                childProcess.ErrorDataReceived += (sender, eventArgs) =>
                {
                    if (!string.IsNullOrWhiteSpace(eventArgs.Data))
                    {
                        AppendLog("ERR " + eventArgs.Data);
                    }
                };

                childProcess.Exited += (sender, eventArgs) =>
                {
                    var exitCode = childProcess.ExitCode;
                    AppendLog("service-monitor.exe exited with code " + exitCode + ".");

                    if (!stopping)
                    {
                        AppendLog("Restarting service-monitor.exe in 5 seconds.");
                        ThreadPool.QueueUserWorkItem(state =>
                        {
                            Thread.Sleep(5000);
                            try
                            {
                                StartMonitor();
                            }
                            catch (Exception exception)
                            {
                                AppendLog("Failed to restart service-monitor.exe: " + exception);
                            }
                        });
                    }
                };

                childProcess.Start();
                childProcess.BeginOutputReadLine();
                childProcess.BeginErrorReadLine();
                AppendLog("Started service-monitor.exe with PID " + childProcess.Id + ".");
            }
        }

        private void StopMonitor()
        {
            lock (sync)
            {
                if (childProcess == null)
                {
                    return;
                }

                try
                {
                    if (!childProcess.HasExited)
                    {
                        AppendLog("Stopping service-monitor.exe with PID " + childProcess.Id + ".");
                        childProcess.Kill();
                        childProcess.WaitForExit(10000);
                    }
                }
                catch (Exception exception)
                {
                    AppendLog("Error while stopping service-monitor.exe: " + exception);
                }
                finally
                {
                    childProcess.Dispose();
                    childProcess = null;
                }
            }
        }

        private void AppendLog(string message)
        {
            try
            {
                Directory.CreateDirectory(LogDirectory);
                File.AppendAllText(LogPath, "[" + DateTime.UtcNow.ToString("O") + "] " + message + Environment.NewLine);
            }
            catch
            {
            }
        }
    }
}

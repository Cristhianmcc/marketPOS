using System;
using System.Diagnostics;
using System.IO;

internal static class SunatBetaLauncher
{
    private static string logPath = "";

    private static void Log(string message)
    {
        try
        {
            File.AppendAllText(
                logPath,
                DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss") + " " + message + Environment.NewLine
            );
        }
        catch { }
    }

    [STAThread]
    private static void Main()
    {
        string localAppData = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
        // This directory must be created by the interactive Windows user.
        // Do not reuse diagnostic profiles because their ACL can belong to the sandbox account.
        string userData = Path.Combine(localAppData, "MonterrialPOS-SUNAT-Beta-Usuario");
        Directory.CreateDirectory(userData);
        logPath = Path.Combine(userData, "inicio.log");
        Log("Iniciando lanzador SUNAT Beta.");

        string baseDir = AppDomain.CurrentDomain.BaseDirectory;
        string target = Path.Combine(baseDir, "Monterrial POS SUNAT Beta.exe");
        if (!File.Exists(target))
        {
            target = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory),
                "marketPOS-sunat-beta",
                "desktop",
                "dist-electron",
                "win-unpacked",
                "Monterrial POS SUNAT Beta.exe"
            );
            baseDir = Path.GetDirectoryName(target);
        }

        Log("Ejecutable: " + target);

        if (!File.Exists(target))
        {
            System.Windows.Forms.MessageBox.Show(
                "No se encontró Monterrial POS SUNAT Beta.exe junto al lanzador.",
                "Monterrial POS SUNAT Beta",
                System.Windows.Forms.MessageBoxButtons.OK,
                System.Windows.Forms.MessageBoxIcon.Error
            );
            Log("No se encontró el ejecutable de la aplicación.");
            return;
        }

        try
        {
            var startInfo = new ProcessStartInfo
            {
                FileName = target,
                Arguments = "--no-sandbox --disable-gpu --enable-logging --log-file=\"" +
                    Path.Combine(userData, "electron.log") + "\" --user-data-dir=\"" + userData + "\"",
                WorkingDirectory = baseDir,
                UseShellExecute = false
            };
            startInfo.EnvironmentVariables.Remove("ELECTRON_RUN_AS_NODE");
            Process process = Process.Start(startInfo);
            if (process == null)
            {
                throw new InvalidOperationException("Windows no devolvió un proceso al iniciar la aplicación.");
            }

            Log("Proceso creado. PID=" + process.Id);
            if (process.WaitForExit(12000))
            {
                int exitCode = process.ExitCode;
                Log("La aplicación terminó durante el inicio. Código=" + exitCode);
                System.Windows.Forms.MessageBox.Show(
                    "La aplicación se cerró durante el inicio (código " + exitCode + ").\n\n" +
                    "Registro: " + logPath,
                    "Monterrial POS SUNAT Beta",
                    System.Windows.Forms.MessageBoxButtons.OK,
                    System.Windows.Forms.MessageBoxIcon.Error
                );
            }
            else
            {
                Log("La aplicación continúa activa después de 12 segundos.");
            }
        }
        catch (Exception error)
        {
            Log("Error al iniciar: " + error);
            System.Windows.Forms.MessageBox.Show(
                "No se pudo iniciar la Beta:\n" + error.Message + "\n\nRegistro: " + logPath,
                "Monterrial POS SUNAT Beta",
                System.Windows.Forms.MessageBoxButtons.OK,
                System.Windows.Forms.MessageBoxIcon.Error
            );
        }
    }
}

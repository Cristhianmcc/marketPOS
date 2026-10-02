using System;
using System.Diagnostics;
using System.IO;

internal static class SunatBetaLauncher
{
    [STAThread]
    private static void Main()
    {
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
        string userData = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
            "MonterrialPOS-SUNAT-Beta-Electron"
        );

        if (!File.Exists(target))
        {
            System.Windows.Forms.MessageBox.Show(
                "No se encontró Monterrial POS SUNAT Beta.exe junto al lanzador.",
                "Monterrial POS SUNAT Beta",
                System.Windows.Forms.MessageBoxButtons.OK,
                System.Windows.Forms.MessageBoxIcon.Error
            );
            return;
        }

        try
        {
            var startInfo = new ProcessStartInfo
            {
                FileName = target,
                Arguments = "--no-sandbox --disable-gpu --user-data-dir=\"" + userData + "\"",
                WorkingDirectory = baseDir,
                UseShellExecute = false
            };
            startInfo.EnvironmentVariables.Remove("ELECTRON_RUN_AS_NODE");
            Process.Start(startInfo);
        }
        catch (Exception error)
        {
            System.Windows.Forms.MessageBox.Show(
                "No se pudo iniciar la Beta:\n" + error.Message,
                "Monterrial POS SUNAT Beta",
                System.Windows.Forms.MessageBoxButtons.OK,
                System.Windows.Forms.MessageBoxIcon.Error
            );
        }
    }
}

using System;
using System.Diagnostics;
using System.IO;

internal static class SunatBetaLauncher
{
    [STAThread]
    private static void Main()
    {
        try
        {
            string baseDir = AppDomain.CurrentDomain.BaseDirectory;
            string target = Path.Combine(baseDir, "Monterrial POS SUNAT Beta.exe");

            if (!File.Exists(target))
            {
                string desktopRoot = Path.Combine(
                    Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory),
                    "marketPOS-sunat-beta",
                    "desktop"
                );
                DateTime newest = DateTime.MinValue;
                if (Directory.Exists(desktopRoot))
                {
                    foreach (string outputDir in Directory.GetDirectories(desktopRoot, "dist-electron*"))
                    {
                        string candidate = Path.Combine(
                            outputDir,
                            "win-unpacked",
                            "Monterrial POS SUNAT Beta.exe"
                        );
                        DateTime modified = File.Exists(candidate)
                            ? File.GetLastWriteTimeUtc(candidate)
                            : DateTime.MinValue;
                        if (modified > newest)
                        {
                            newest = modified;
                            target = candidate;
                        }
                    }
                }
                baseDir = Path.GetDirectoryName(target);
            }

            if (!File.Exists(target))
            {
                throw new FileNotFoundException(
                    "No se encontro Monterrial POS SUNAT Beta.exe.",
                    target
                );
            }

            var startInfo = new ProcessStartInfo
            {
                FileName = target,
                Arguments = "--sunat-beta-isolated --no-sandbox --disable-gpu --enable-logging " +
                    "--user-data-dir=\"" + Path.GetFullPath(Path.Combine(
                        baseDir,
                        "..",
                        "..",
                        "..",
                        ".sunat-beta-runtime",
                        "electron-profile"
                    )) + "\"",
                WorkingDirectory = baseDir,
                UseShellExecute = false
            };
            startInfo.EnvironmentVariables.Remove("ELECTRON_RUN_AS_NODE");

            Process process = Process.Start(startInfo);
            if (process == null)
            {
                throw new InvalidOperationException("Windows no devolvio el proceso de la aplicacion.");
            }

            if (process.WaitForExit(12000) && process.ExitCode != 0)
            {
                System.Windows.Forms.MessageBox.Show(
                    "La aplicacion se cerro durante el inicio. Codigo: " + process.ExitCode,
                    "Monterrial POS SUNAT Beta",
                    System.Windows.Forms.MessageBoxButtons.OK,
                    System.Windows.Forms.MessageBoxIcon.Error
                );
            }
        }
        catch (Exception error)
        {
            System.Windows.Forms.MessageBox.Show(
                "No se pudo iniciar la Beta:\n\n" + error.Message,
                "Monterrial POS SUNAT Beta",
                System.Windows.Forms.MessageBoxButtons.OK,
                System.Windows.Forms.MessageBoxIcon.Error
            );
        }
    }
}

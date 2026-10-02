param(
    [Parameter(Mandatory=$true)][string]$PrinterName,
    [Parameter(Mandatory=$true)][string]$FilePath
)

Add-Type -TypeDefinition @'
using System;
using System.IO;
using System.Runtime.InteropServices;

public class RawPrinterHelper {
    [StructLayout(LayoutKind.Sequential)]
    public struct DOCINFOA {
        [MarshalAs(UnmanagedType.LPStr)] public string pDocName;
        [MarshalAs(UnmanagedType.LPStr)] public string pOutputFile;
        [MarshalAs(UnmanagedType.LPStr)] public string pDataType;
    }

    [DllImport("winspool.drv", SetLastError = true, CharSet = CharSet.Ansi)]
    public static extern bool OpenPrinter(string p, out IntPtr h, IntPtr d);

    [DllImport("winspool.drv", SetLastError = true)]
    public static extern bool ClosePrinter(IntPtr h);

    [DllImport("winspool.drv", SetLastError = true, CharSet = CharSet.Ansi)]
    public static extern bool StartDocPrinter(IntPtr h, int l, ref DOCINFOA di);

    [DllImport("winspool.drv", SetLastError = true)]
    public static extern bool EndDocPrinter(IntPtr h);

    [DllImport("winspool.drv", SetLastError = true)]
    public static extern bool StartPagePrinter(IntPtr h);

    [DllImport("winspool.drv", SetLastError = true)]
    public static extern bool EndPagePrinter(IntPtr h);

    [DllImport("winspool.drv", SetLastError = true)]
    public static extern bool WritePrinter(IntPtr h, IntPtr b, int c, out int w);

    public static bool SendRawData(string printerName, byte[] data) {
        IntPtr hPrinter;
        DOCINFOA di = new DOCINFOA();
        di.pDocName = "MarketPOS Ticket";
        di.pDataType = "RAW";

        if (!OpenPrinter(printerName, out hPrinter, IntPtr.Zero))
            return false;

        try {
            if (!StartDocPrinter(hPrinter, 1, ref di)) return false;
            if (!StartPagePrinter(hPrinter)) return false;

            IntPtr buf = Marshal.AllocCoTaskMem(data.Length);
            Marshal.Copy(data, 0, buf, data.Length);

            int written;
            bool ok = WritePrinter(hPrinter, buf, data.Length, out written);
            Marshal.FreeCoTaskMem(buf);

            EndPagePrinter(hPrinter);
            EndDocPrinter(hPrinter);

            return ok && (written == data.Length);
        } finally {
            ClosePrinter(hPrinter);
        }
    }
}
'@

$bytes = [System.IO.File]::ReadAllBytes($FilePath)
$result = [RawPrinterHelper]::SendRawData($PrinterName, $bytes)
Write-Output $result

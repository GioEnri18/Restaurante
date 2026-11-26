param(
  [Parameter(Mandatory = $true)]
  [string]$PrinterName,

  [Parameter(Mandatory = $true)]
  [string]$FilePath
)

$ErrorActionPreference = 'Stop'

if (-not (Test-Path -LiteralPath $FilePath)) {
  throw "Archivo temporal de ticket no encontrado: $FilePath"
}

$signature = @'
using System;
using System.IO;
using System.Runtime.InteropServices;

public static class RawPrinterHelper {
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
  public class DOCINFOA {
    [MarshalAs(UnmanagedType.LPWStr)]
    public string pDocName;
    [MarshalAs(UnmanagedType.LPWStr)]
    public string pOutputFile;
    [MarshalAs(UnmanagedType.LPWStr)]
    public string pDataType;
  }

  [DllImport("winspool.Drv", EntryPoint = "OpenPrinterW", SetLastError = true, CharSet = CharSet.Unicode)]
  public static extern bool OpenPrinter(string szPrinter, out IntPtr hPrinter, IntPtr pd);

  [DllImport("winspool.Drv", EntryPoint = "ClosePrinter", SetLastError = true)]
  public static extern bool ClosePrinter(IntPtr hPrinter);

  [DllImport("winspool.Drv", EntryPoint = "StartDocPrinterW", SetLastError = true, CharSet = CharSet.Unicode)]
  public static extern bool StartDocPrinter(IntPtr hPrinter, Int32 level, [In, MarshalAs(UnmanagedType.LPStruct)] DOCINFOA di);

  [DllImport("winspool.Drv", EntryPoint = "EndDocPrinter", SetLastError = true)]
  public static extern bool EndDocPrinter(IntPtr hPrinter);

  [DllImport("winspool.Drv", EntryPoint = "StartPagePrinter", SetLastError = true)]
  public static extern bool StartPagePrinter(IntPtr hPrinter);

  [DllImport("winspool.Drv", EntryPoint = "EndPagePrinter", SetLastError = true)]
  public static extern bool EndPagePrinter(IntPtr hPrinter);

  [DllImport("winspool.Drv", EntryPoint = "WritePrinter", SetLastError = true)]
  public static extern bool WritePrinter(IntPtr hPrinter, byte[] pBytes, Int32 dwCount, out Int32 dwWritten);

  public static void SendFile(string printerName, string filePath) {
    byte[] bytes = File.ReadAllBytes(filePath);
    IntPtr hPrinter = IntPtr.Zero;
    DOCINFOA di = new DOCINFOA {
      pDocName = "POS Restaurante GT",
      pDataType = "RAW"
    };

    if (!OpenPrinter(printerName, out hPrinter, IntPtr.Zero)) {
      throw new InvalidOperationException("No se pudo abrir la impresora '" + printerName + "' (Win32=" + Marshal.GetLastWin32Error() + ")");
    }

    try {
      if (!StartDocPrinter(hPrinter, 1, di)) {
        throw new InvalidOperationException("StartDocPrinter falló (Win32=" + Marshal.GetLastWin32Error() + ")");
      }
      try {
        if (!StartPagePrinter(hPrinter)) {
          throw new InvalidOperationException("StartPagePrinter falló (Win32=" + Marshal.GetLastWin32Error() + ")");
        }
        try {
          int written = 0;
          if (!WritePrinter(hPrinter, bytes, bytes.Length, out written) || written != bytes.Length) {
            throw new InvalidOperationException("WritePrinter escribió " + written + " de " + bytes.Length + " bytes (Win32=" + Marshal.GetLastWin32Error() + ")");
          }
        } finally {
          EndPagePrinter(hPrinter);
        }
      } finally {
        EndDocPrinter(hPrinter);
      }
    } finally {
      ClosePrinter(hPrinter);
    }
  }
}
'@

if (-not ('RawPrinterHelper' -as [type])) {
  Add-Type -TypeDefinition $signature -Language CSharp
}

[RawPrinterHelper]::SendFile($PrinterName, $FilePath)

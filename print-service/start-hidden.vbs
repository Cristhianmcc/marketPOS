Set WshShell = CreateObject("WScript.Shell")
WshShell.Run """" & Replace(WScript.ScriptFullName, "start-hidden.vbs", "MarketPOS-Print.exe") & """", 0, False

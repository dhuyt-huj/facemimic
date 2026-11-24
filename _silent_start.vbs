Set ws = CreateObject(""WScript.Shell"")
ws.CurrentDirectory = ""d:\Program Files\ahh5\facemimic""
ws.Run ""node backend.js"", 0, False

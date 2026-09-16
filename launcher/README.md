# Windows launcher

`Play Connecting the Grid.exe`, at the top of the repository, is a
double-click way into the game for people who receive the folder and would
not know to open `index.html`. The instructions they read are in
[How to play.txt](../How%20to%20play.txt), beside it; this page is for whoever
maintains the program.

## What it does

It opens `index.html`, from the folder the exe sits in, in the default web
browser, then exits. It starts no server and installs nothing: the game runs
straight off the disk over `file://`, so handing the page to a browser is all
there is to do.

**Which browser.** It reads the browser Windows has set for web links (the
`http` association in the registry, where recent Windows 11 builds keep it
under `UserChoiceLatest`) and starts that browser with the page's address.
Opening `index.html` the plain way would use whatever program claims `.html`
files, and on a developer's PC that is often a code editor, which shows the
source instead of the game. If the browser cannot be worked out, it falls back
to exactly that plain way.

**When the page is not there** — the exe copied out of the folder, or
double-clicked from inside a zip, where Windows extracts only the exe to a
temporary folder — it shows a message saying where it looked and what to do,
instead of silently opening nothing.

## Sharing it

The exe is not digitally signed. A copy that arrived from the internet (a
download, a GitHub zip, a shared drive) gets stopped the first time by Windows
SmartScreen, the "Windows protected your PC" box, until the player clicks
**More info** and then **Run anyway**. Some antivirus products are wary of
small unsigned programs too. The only real cure is signing it with a
code-signing certificate, which is bought yearly from a certificate authority.

Mail services such as Gmail and Outlook refuse `.exe` files even inside a zip,
so the folder has to travel by link or shared drive.

## Rebuilding it

From the repository folder, with the C# compiler that every Windows PC already
carries as part of .NET Framework 4:

```
C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe /nologo /target:winexe /optimize+ /r:System.Windows.Forms.dll /win32icon:launcher\icon.ico "/out:Play Connecting the Grid.exe" launcher\Launcher.cs
```

That compiler only understands C# up to version 5, so
[Launcher.cs](Launcher.cs) avoids newer syntax such as `$"..."` strings and
`?.`. `/target:winexe` is what stops a black console window flashing up
before the browser.

[icon.ico](icon.ico) is the power-station marker from
`img/marker-generation.svg`, filled in so it stays visible on a dark
taskbar, at 16, 24, 32, 48 and 256 pixels. Any `.ico` file can replace it.

There are no automated tests. After a rebuild, check by hand:

1. Double-click the exe in the repository folder: the game opens in the
   default browser, and the exe does not stay running.
2. Copy the exe alone into an empty folder and double-click it there: a
   message box says `index.html` was not found.

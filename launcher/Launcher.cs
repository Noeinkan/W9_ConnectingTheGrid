// Double-click launcher for Windows: opens index.html, from the folder this exe
// sits in, in the default web browser. It starts no server and stays running
// for no longer than it takes to hand the page over - the game runs straight
// off the disk over file://.
//
// Written for the C# 5 compiler that ships inside Windows with .NET Framework
// 4, so it can be rebuilt on any Windows PC with nothing installed. The build
// command is in README.md, in this folder.

using System;
using System.Diagnostics;
using System.IO;
using System.Reflection;
using System.Windows.Forms;
using Microsoft.Win32;

[assembly: AssemblyTitle("Connecting the Grid")]
[assembly: AssemblyProduct("Connecting the Grid")]
[assembly: AssemblyDescription("Opens the game in the default web browser")]
[assembly: AssemblyVersion("1.0.0.0")]

static class Launcher
{
    const string Title = "Connecting the Grid";

    [STAThread]
    static void Main()
    {
        string page = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "index.html");
        if (!File.Exists(page))
        {
            MessageBox.Show(
                "index.html was not found next to this program:\n\n" + page +
                "\n\nKeep the program inside the game folder, beside index.html, and try again." +
                "\n\nIf the game came as a zip file, extract the whole zip first " +
                "(right-click it, Extract All) and run the program from the extracted folder.",
                Title, MessageBoxButtons.OK, MessageBoxIcon.Error);
            return;
        }

        // The browser registered for web links comes first: .html files are
        // often claimed by an editor, which would open the source instead of
        // the game. Whatever opens .html files is the fallback.
        try
        {
            if (OpenInDefaultBrowser(new Uri(page).AbsoluteUri)) return;
        }
        catch (Exception) { }

        try
        {
            Process.Start(new ProcessStartInfo(page) { UseShellExecute = true });
        }
        catch (Exception e)
        {
            MessageBox.Show(
                "The game could not be opened automatically (" + e.Message + ").\n\n" +
                "Open this file in a web browser instead:\n\n" + page,
                Title, MessageBoxButtons.OK, MessageBoxIcon.Warning);
        }
    }

    static bool OpenInDefaultBrowser(string url)
    {
        string command = DefaultBrowserCommand();
        if (string.IsNullOrEmpty(command)) return false;

        string exe, args;
        command = command.Trim();
        if (command.StartsWith("\""))
        {
            int close = command.IndexOf('"', 1);
            if (close < 0) return false;
            exe = command.Substring(1, close - 1);
            args = command.Substring(close + 1).Trim();
        }
        else
        {
            int space = command.IndexOf(' ');
            exe = space < 0 ? command : command.Substring(0, space);
            args = space < 0 ? "" : command.Substring(space + 1).Trim();
        }
        if (!File.Exists(exe)) return false;

        if (args.Contains("%1") || args.Contains("%L"))
            args = args.Replace("%1", url).Replace("%L", url);
        else
            args = (args + " \"" + url + "\"").Trim();
        args = args.Replace("%*", "").Trim();

        Process.Start(new ProcessStartInfo(exe, args) { UseShellExecute = false });
        return true;
    }

    // Windows records the chosen browser as a ProgId under the user's http
    // association; recent Windows 11 builds keep it in UserChoiceLatest.
    static string DefaultBrowserCommand()
    {
        const string http = @"Software\Microsoft\Windows\Shell\Associations\UrlAssociations\http\";
        string progId = ReadString(Registry.CurrentUser, http + @"UserChoiceLatest\ProgId", "ProgId")
                     ?? ReadString(Registry.CurrentUser, http + "UserChoice", "ProgId");
        if (string.IsNullOrEmpty(progId)) return null;
        return ReadString(Registry.ClassesRoot, progId + @"\shell\open\command", "");
    }

    static string ReadString(RegistryKey root, string path, string name)
    {
        using (RegistryKey key = root.OpenSubKey(path))
        {
            if (key == null) return null;
            string value = key.GetValue(name) as string;
            return string.IsNullOrEmpty(value) ? null : value;
        }
    }
}

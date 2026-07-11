using SCPI.Scopes;
using System;
using System.Drawing;
using System.Globalization;
using System.IO;
using System.Windows.Forms;
using System.Windows.Input;

namespace SCPI
{
    public partial class Form1 : Form
    {

        public Form1()
        {
            InitializeComponent();
        }

        [System.Runtime.InteropServices.DllImport("user32.dll")]
        private static extern IntPtr SendMessage(IntPtr hWnd, int msg, IntPtr wp, IntPtr lp);

        protected override void OnLoad(EventArgs e)
        {
            var btn = new Button();
            btn.Size = new Size(25, TextBoxFilePath.ClientSize.Height + 2);
            btn.Location = new Point(TextBoxFilePath.ClientSize.Width - btn.Width, -1);
            btn.Cursor = System.Windows.Forms.Cursors.Default;
            btn.Click += btn_Click;
            TextBoxFilePath.Controls.Add(btn);
            // Send EM_SETMARGINS to prevent text from disappearing underneath the button
            SendMessage(TextBoxFilePath.Handle, 0xd3, (IntPtr)2, (IntPtr)(btn.Width << 16));
            btn.Text = "···";
            // Make the text inside the button bold
            // TODO            
            base.OnLoad(e);
        }

        private void Form1_Load(object sender, EventArgs e)
        {
            try
            {
                // Set the title of the form to disconnected
                this.Text = "SCPI Screen Capture";

                // Initialize the Telnet Connection object
                Oscilloscope.telnetCon = new Telnet.TelnetCon();

                // If no path is stored, set the default path to MyPictures
                if (Properties.Settings.Default.Path == "")
                {
                    Properties.Settings.Default.Path = Environment.GetFolderPath(Environment.SpecialFolder.MyPictures) + "\\";
                    Properties.Settings.Default.Save();
                }

                // Load last path from stored settings
                TextBoxFilePath.Text = Properties.Settings.Default.Path;

                // Load last IP from stored settings
                IP_Field1.SetIP(Properties.Settings.Default.IP);

                cBox_Extension.SelectedIndex = Properties.Settings.Default.Extension;
                chBox_Color.Checked = Properties.Settings.Default.Color;
                chBox_Invert.Checked = Properties.Settings.Default.Invert;

                // Try to connect to the last IP with very short timeout
                Oscilloscope.telnetCon.Open(Properties.Settings.Default.IP, 20);
                toolstrip_StatusLabel.Text = "Connected : " + Oscilloscope.telnetCon.Hostname;
                btn_connect.Text = "Disconnect";
            }
            catch (Exception ex)
            {
                toolstrip_StatusLabel.Text = "Disconnected";
            }
        }

        private void button1_Click(object sender, EventArgs e)
        {
            // Save the settings
            try
            {
                Properties.Settings.Default.Extension = (byte)cBox_Extension.SelectedIndex;
                Properties.Settings.Default.Color = chBox_Color.Checked;
                Properties.Settings.Default.Invert = chBox_Invert.Checked;
                Properties.Settings.Default.Path = TextBoxFilePath.Text;
                Properties.Settings.Default.Copy = chBox_Copy.Checked;
                Properties.Settings.Default.Save = chBox_Save.Checked;
                Properties.Settings.Default.HotKey = chBox_HotKey.Checked;
                Properties.Settings.Default.Save();
            }
            catch (Exception ex)
            {
                Console.WriteLine(ex.ToString());
            }

            // Get the screen capture
            try
            {
                if (Oscilloscope.telnetCon.IsOpen)
                {
                    // Get the screen capture data
                    byte[] data = Rigol1000.getScreenCapture((byte)cBox_Extension.SelectedIndex, chBox_Color.Checked, chBox_Invert.Checked);

                    // Copy to clipboard
                    if (chBox_Copy.Checked)
                    {
                        Bitmap bitmap = new Bitmap(new MemoryStream(data));
                        Clipboard.SetData(DataFormats.Bitmap, bitmap);
                        // Play a beep sound to indicate that the image is copied to the clipboard
                        System.Media.SystemSounds.Beep.Play();
                    }

                    // Save to file
                    if (chBox_Save.Checked)
                    {
                        string filename = DateTime.Now.ToString(new CultureInfo("de-DE")).Replace(":", ".") + "." + Rigol1000.extensions[cBox_Extension.SelectedIndex];
                        File.WriteAllBytes(TextBoxFilePath.Text + filename, data);
                    }

                }
                else
                    MessageBox.Show("Telnet is closed");

            }
            catch (Exception ec)
            {
                Console.WriteLine(ec.ToString());
            }
        }



        private void btn_Click(object sender, EventArgs e)
        {

            FolderBrowserDialog fbd = new FolderBrowserDialog();
            DialogResult result = fbd.ShowDialog();

            if (result == DialogResult.OK && !string.IsNullOrWhiteSpace(fbd.SelectedPath))
            {
                Properties.Settings.Default.Path = fbd.SelectedPath + "\\";
                Properties.Settings.Default.Save();
                TextBoxFilePath.Text = Properties.Settings.Default.Path;
            }
        }

        private void btn_connect_Click(object sender, EventArgs e)
        {
            if (Oscilloscope.telnetCon.IsOpen)
            {
                Oscilloscope.telnetCon.Dispose();
                btn_connect.Text = "Connect";
                toolstrip_StatusLabel.Text = "Disconnected";
            }
            else
            {
                try
                {
                    string hostName = IP_Field1.GetIP();
                    // Try to open telnet with respective timeout
                    Oscilloscope.telnetCon.Open(hostName, 5000);
                    Properties.Settings.Default.IP = hostName;
                    Properties.Settings.Default.Save();
                    btn_connect.Text = "Disconnect";
                    toolstrip_StatusLabel.Text = "Connected : " + Oscilloscope.telnetCon.Hostname;
                    btn_capture.Focus();
                }
                catch (Exception ex)
                {
                    MessageBox.Show("Connection Failed");
                }
            }
        }

        private void chBox_HotKey_CheckedChanged(object sender, EventArgs e)
        {
            if (chBox_HotKey.Checked)
            {
                //GlobalHotKey.RegisterHotKey("Ctrl + PrintScreen", () => button1_Click(null, null));
                GlobalHotKey.RegisterHotKey(System.Windows.Input.ModifierKeys.Control, Key.PrintScreen, () => button1_Click(null, null));
            }
            else
            {
                GlobalHotKey.DisposeAllHotkeys();
            }
        }
    }
}
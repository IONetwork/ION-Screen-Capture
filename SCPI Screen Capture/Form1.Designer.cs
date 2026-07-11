namespace SCPI
{
    partial class Form1
    {
        /// <summary>
        /// Required designer variable.
        /// </summary>
        private System.ComponentModel.IContainer components = null;

        /// <summary>
        /// Clean up any resources being used.
        /// </summary>
        /// <param name="disposing">true if managed resources should be disposed; otherwise, false.</param>
        protected override void Dispose(bool disposing)
        {
            if (disposing && (components != null))
            {
                components.Dispose();
            }
            base.Dispose(disposing);
        }

        #region Windows Form Designer generated code

        /// <summary>
        /// Required method for Designer support - do not modify
        /// the contents of this method with the code editor.
        /// </summary>
        private void InitializeComponent()
        {
            this.btn_capture = new System.Windows.Forms.Button();
            this.cBox_Extension = new System.Windows.Forms.ComboBox();
            this.chBox_Color = new System.Windows.Forms.CheckBox();
            this.chBox_Invert = new System.Windows.Forms.CheckBox();
            this.TextBoxFilePath = new System.Windows.Forms.TextBox();
            this.btn_connect = new System.Windows.Forms.Button();
            this.label1 = new System.Windows.Forms.Label();
            this.statusStrip1 = new System.Windows.Forms.StatusStrip();
            this.toolStripStatusLabel1 = new System.Windows.Forms.ToolStripStatusLabel();
            this.chBox_Copy = new System.Windows.Forms.CheckBox();
            this.chBox_HotKey = new System.Windows.Forms.CheckBox();
            this.chBox_Save = new System.Windows.Forms.CheckBox();
            this.toolstrip_StatusLabel = new System.Windows.Forms.ToolStripStatusLabel();
            this.toolStripStatusLabel3 = new System.Windows.Forms.ToolStripStatusLabel();
            this.IP_Field1 = new SCPI.IP_Field();
            this.statusStrip1.SuspendLayout();
            this.SuspendLayout();
            // 
            // btn_capture
            // 
            this.btn_capture.Location = new System.Drawing.Point(13, 111);
            this.btn_capture.Name = "btn_capture";
            this.btn_capture.Size = new System.Drawing.Size(340, 40);
            this.btn_capture.TabIndex = 0;
            this.btn_capture.Text = "Capture";
            this.btn_capture.UseVisualStyleBackColor = true;
            this.btn_capture.Click += new System.EventHandler(this.button1_Click);
            // 
            // cBox_Extension
            // 
            this.cBox_Extension.FormattingEnabled = true;
            this.cBox_Extension.Items.AddRange(new object[] {
            "BMP24",
            "BMP8",
            "PNG",
            "JPEG",
            "TIFF"});
            this.cBox_Extension.Location = new System.Drawing.Point(278, 46);
            this.cBox_Extension.Name = "cBox_Extension";
            this.cBox_Extension.Size = new System.Drawing.Size(75, 21);
            this.cBox_Extension.TabIndex = 5;
            // 
            // chBox_Color
            // 
            this.chBox_Color.AutoSize = true;
            this.chBox_Color.Checked = true;
            this.chBox_Color.CheckState = System.Windows.Forms.CheckState.Checked;
            this.chBox_Color.Location = new System.Drawing.Point(244, 85);
            this.chBox_Color.Name = "chBox_Color";
            this.chBox_Color.RightToLeft = System.Windows.Forms.RightToLeft.No;
            this.chBox_Color.Size = new System.Drawing.Size(50, 17);
            this.chBox_Color.TabIndex = 8;
            this.chBox_Color.Text = "Color";
            this.chBox_Color.UseVisualStyleBackColor = true;
            // 
            // chBox_Invert
            // 
            this.chBox_Invert.AutoSize = true;
            this.chBox_Invert.Location = new System.Drawing.Point(300, 85);
            this.chBox_Invert.Name = "chBox_Invert";
            this.chBox_Invert.RightToLeft = System.Windows.Forms.RightToLeft.No;
            this.chBox_Invert.Size = new System.Drawing.Size(53, 17);
            this.chBox_Invert.TabIndex = 9;
            this.chBox_Invert.Text = "Invert";
            this.chBox_Invert.UseVisualStyleBackColor = true;
            // 
            // TextBoxFilePath
            // 
            this.TextBoxFilePath.Location = new System.Drawing.Point(78, 47);
            this.TextBoxFilePath.Name = "TextBoxFilePath";
            this.TextBoxFilePath.Size = new System.Drawing.Size(194, 20);
            this.TextBoxFilePath.TabIndex = 4;
            // 
            // btn_connect
            // 
            this.btn_connect.Location = new System.Drawing.Point(278, 12);
            this.btn_connect.Name = "btn_connect";
            this.btn_connect.Size = new System.Drawing.Size(75, 23);
            this.btn_connect.TabIndex = 2;
            this.btn_connect.Text = "Connect";
            this.btn_connect.UseVisualStyleBackColor = true;
            this.btn_connect.Click += new System.EventHandler(this.btn_connect_Click);
            // 
            // label1
            // 
            this.label1.AutoSize = true;
            this.label1.Location = new System.Drawing.Point(10, 10);
            this.label1.Name = "label1";
            this.label1.Size = new System.Drawing.Size(67, 26);
            this.label1.TabIndex = 7;
            this.label1.Text = "Oscilloscope\r\nIP Address";
            this.label1.TextAlign = System.Drawing.ContentAlignment.MiddleCenter;
            // 
            // statusStrip1
            // 
            this.statusStrip1.Items.AddRange(new System.Windows.Forms.ToolStripItem[] {
            this.toolStripStatusLabel1,
            this.toolStripStatusLabel3,
            this.toolstrip_StatusLabel});
            this.statusStrip1.Location = new System.Drawing.Point(0, 158);
            this.statusStrip1.Name = "statusStrip1";
            this.statusStrip1.Size = new System.Drawing.Size(370, 22);
            this.statusStrip1.TabIndex = 16;
            this.statusStrip1.Text = "statusStrip1";
            // 
            // toolStripStatusLabel1
            // 
            this.toolStripStatusLabel1.Name = "toolStripStatusLabel1";
            this.toolStripStatusLabel1.Size = new System.Drawing.Size(72, 17);
            this.toolStripStatusLabel1.Text = "Version 1.0.0";
            // 
            // chBox_Copy
            // 
            this.chBox_Copy.AutoSize = true;
            this.chBox_Copy.Checked = true;
            this.chBox_Copy.CheckState = System.Windows.Forms.CheckState.Checked;
            this.chBox_Copy.Location = new System.Drawing.Point(129, 85);
            this.chBox_Copy.Name = "chBox_Copy";
            this.chBox_Copy.RightToLeft = System.Windows.Forms.RightToLeft.No;
            this.chBox_Copy.Size = new System.Drawing.Size(109, 17);
            this.chBox_Copy.TabIndex = 7;
            this.chBox_Copy.Text = "Copy to Clipboard";
            this.chBox_Copy.UseVisualStyleBackColor = true;
            // 
            // chBox_HotKey
            // 
            this.chBox_HotKey.AutoSize = true;
            this.chBox_HotKey.Checked = true;
            this.chBox_HotKey.CheckState = System.Windows.Forms.CheckState.Checked;
            this.chBox_HotKey.Location = new System.Drawing.Point(12, 85);
            this.chBox_HotKey.Name = "chBox_HotKey";
            this.chBox_HotKey.RightToLeft = System.Windows.Forms.RightToLeft.No;
            this.chBox_HotKey.Size = new System.Drawing.Size(111, 17);
            this.chBox_HotKey.TabIndex = 6;
            this.chBox_HotKey.Text = "Ctrl + Print Screen";
            this.chBox_HotKey.UseVisualStyleBackColor = true;
            this.chBox_HotKey.CheckedChanged += new System.EventHandler(this.chBox_HotKey_CheckedChanged);
            // 
            // chBox_Save
            // 
            this.chBox_Save.AutoSize = true;
            this.chBox_Save.Checked = true;
            this.chBox_Save.CheckState = System.Windows.Forms.CheckState.Checked;
            this.chBox_Save.Location = new System.Drawing.Point(12, 50);
            this.chBox_Save.Name = "chBox_Save";
            this.chBox_Save.RightToLeft = System.Windows.Forms.RightToLeft.No;
            this.chBox_Save.Size = new System.Drawing.Size(51, 17);
            this.chBox_Save.TabIndex = 3;
            this.chBox_Save.Text = "Save";
            this.chBox_Save.UseVisualStyleBackColor = true;
            // 
            // toolstrip_StatusLabel
            // 
            this.toolstrip_StatusLabel.Name = "toolstrip_StatusLabel";
            this.toolstrip_StatusLabel.Overflow = System.Windows.Forms.ToolStripItemOverflow.Never;
            this.toolstrip_StatusLabel.RightToLeft = System.Windows.Forms.RightToLeft.Yes;
            this.toolstrip_StatusLabel.Size = new System.Drawing.Size(79, 17);
            this.toolstrip_StatusLabel.Text = "Disconnected";
            this.toolstrip_StatusLabel.TextAlign = System.Drawing.ContentAlignment.MiddleRight;
            // 
            // toolStripStatusLabel3
            // 
            this.toolStripStatusLabel3.Name = "toolStripStatusLabel3";
            this.toolStripStatusLabel3.Size = new System.Drawing.Size(118, 17);
            this.toolStripStatusLabel3.Text = "                                     ";
            // 
            // IP_Field1
            // 
            this.IP_Field1.AutoSize = true;
            this.IP_Field1.AutoSizeMode = System.Windows.Forms.AutoSizeMode.GrowAndShrink;
            this.IP_Field1.BackColor = System.Drawing.Color.Transparent;
            this.IP_Field1.Location = new System.Drawing.Point(95, 12);
            this.IP_Field1.Name = "IP_Field1";
            this.IP_Field1.Size = new System.Drawing.Size(173, 27);
            this.IP_Field1.TabIndex = 1;
            // 
            // Form1
            // 
            this.AutoScaleDimensions = new System.Drawing.SizeF(6F, 13F);
            this.AutoScaleMode = System.Windows.Forms.AutoScaleMode.Font;
            this.ClientSize = new System.Drawing.Size(370, 180);
            this.Controls.Add(this.chBox_Save);
            this.Controls.Add(this.chBox_HotKey);
            this.Controls.Add(this.chBox_Copy);
            this.Controls.Add(this.statusStrip1);
            this.Controls.Add(this.IP_Field1);
            this.Controls.Add(this.btn_connect);
            this.Controls.Add(this.label1);
            this.Controls.Add(this.TextBoxFilePath);
            this.Controls.Add(this.chBox_Invert);
            this.Controls.Add(this.chBox_Color);
            this.Controls.Add(this.cBox_Extension);
            this.Controls.Add(this.btn_capture);
            this.FormBorderStyle = System.Windows.Forms.FormBorderStyle.FixedSingle;
            this.MaximizeBox = false;
            this.Name = "Form1";
            this.StartPosition = System.Windows.Forms.FormStartPosition.CenterScreen;
            this.Text = " ";
            this.Load += new System.EventHandler(this.Form1_Load);
            this.statusStrip1.ResumeLayout(false);
            this.statusStrip1.PerformLayout();
            this.ResumeLayout(false);
            this.PerformLayout();

        }

        #endregion

        private System.Windows.Forms.Button btn_capture;
        private System.Windows.Forms.ComboBox cBox_Extension;
        private System.Windows.Forms.CheckBox chBox_Color;
        private System.Windows.Forms.CheckBox chBox_Invert;
        private System.Windows.Forms.TextBox TextBoxFilePath;
        private System.Windows.Forms.Button btn_connect;
        private System.Windows.Forms.Label label1;
        private IP_Field IP_Field1;
        private System.Windows.Forms.StatusStrip statusStrip1;
        private System.Windows.Forms.ToolStripStatusLabel toolStripStatusLabel1;
        private System.Windows.Forms.CheckBox chBox_Copy;
        private System.Windows.Forms.CheckBox chBox_HotKey;
        private System.Windows.Forms.CheckBox chBox_Save;
        private System.Windows.Forms.ToolStripStatusLabel toolStripStatusLabel3;
        private System.Windows.Forms.ToolStripStatusLabel toolstrip_StatusLabel;
    }
}


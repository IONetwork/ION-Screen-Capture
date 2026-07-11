namespace SCPI
{
    partial class IP_Field
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

        #region Component Designer generated code

        /// <summary> 
        /// Required method for Designer support - do not modify 
        /// the contents of this method with the code editor.
        /// </summary>
        private void InitializeComponent()
        {
            this.box_1 = new System.Windows.Forms.TextBox();
            this.dot_label_1 = new System.Windows.Forms.Label();
            this.label1 = new System.Windows.Forms.Label();
            this.label2 = new System.Windows.Forms.Label();
            this.box_2 = new System.Windows.Forms.TextBox();
            this.box_3 = new System.Windows.Forms.TextBox();
            this.box_4 = new System.Windows.Forms.TextBox();
            this.SuspendLayout();
            // 
            // box_1
            // 
            this.box_1.BorderStyle = System.Windows.Forms.BorderStyle.None;
            this.box_1.Font = new System.Drawing.Font("Microsoft Sans Serif", 10F, System.Drawing.FontStyle.Regular, System.Drawing.GraphicsUnit.Point, ((byte)(0)));
            this.box_1.Location = new System.Drawing.Point(3, 3);
            this.box_1.MaxLength = 3;
            this.box_1.Name = "box_1";
            this.box_1.Size = new System.Drawing.Size(32, 16);
            this.box_1.TabIndex = 0;
            this.box_1.Text = "192";
            this.box_1.TextAlign = System.Windows.Forms.HorizontalAlignment.Center;
            this.box_1.WordWrap = false;
            this.box_1.TextChanged += new System.EventHandler(this.box_1_TextChanged);
            // 
            // dot_label_1
            // 
            this.dot_label_1.AutoSize = true;
            this.dot_label_1.BackColor = System.Drawing.Color.Transparent;
            this.dot_label_1.Font = new System.Drawing.Font("Microsoft Sans Serif", 24F, System.Drawing.FontStyle.Regular, System.Drawing.GraphicsUnit.Point, ((byte)(0)));
            this.dot_label_1.Location = new System.Drawing.Point(29, -10);
            this.dot_label_1.Name = "dot_label_1";
            this.dot_label_1.Size = new System.Drawing.Size(26, 37);
            this.dot_label_1.TabIndex = 4;
            this.dot_label_1.Text = ".";
            // 
            // label1
            // 
            this.label1.AutoSize = true;
            this.label1.BackColor = System.Drawing.Color.Transparent;
            this.label1.Font = new System.Drawing.Font("Microsoft Sans Serif", 24F, System.Drawing.FontStyle.Regular, System.Drawing.GraphicsUnit.Point, ((byte)(0)));
            this.label1.Location = new System.Drawing.Point(74, -10);
            this.label1.Name = "label1";
            this.label1.Size = new System.Drawing.Size(26, 37);
            this.label1.TabIndex = 5;
            this.label1.Text = ".";
            // 
            // label2
            // 
            this.label2.AutoSize = true;
            this.label2.BackColor = System.Drawing.Color.Transparent;
            this.label2.Font = new System.Drawing.Font("Microsoft Sans Serif", 24F, System.Drawing.FontStyle.Regular, System.Drawing.GraphicsUnit.Point, ((byte)(0)));
            this.label2.Location = new System.Drawing.Point(119, -10);
            this.label2.Name = "label2";
            this.label2.Size = new System.Drawing.Size(26, 37);
            this.label2.TabIndex = 6;
            this.label2.Text = ".";
            // 
            // box_2
            // 
            this.box_2.BorderStyle = System.Windows.Forms.BorderStyle.None;
            this.box_2.Font = new System.Drawing.Font("Microsoft Sans Serif", 10F, System.Drawing.FontStyle.Regular, System.Drawing.GraphicsUnit.Point, ((byte)(0)));
            this.box_2.Location = new System.Drawing.Point(48, 3);
            this.box_2.MaxLength = 3;
            this.box_2.Name = "box_2";
            this.box_2.Size = new System.Drawing.Size(32, 16);
            this.box_2.TabIndex = 1;
            this.box_2.Text = "168";
            this.box_2.TextAlign = System.Windows.Forms.HorizontalAlignment.Center;
            this.box_2.WordWrap = false;
            this.box_2.TextChanged += new System.EventHandler(this.box_2_TextChanged);
            // 
            // box_3
            // 
            this.box_3.BorderStyle = System.Windows.Forms.BorderStyle.None;
            this.box_3.Font = new System.Drawing.Font("Microsoft Sans Serif", 10F, System.Drawing.FontStyle.Regular, System.Drawing.GraphicsUnit.Point, ((byte)(0)));
            this.box_3.Location = new System.Drawing.Point(93, 3);
            this.box_3.MaxLength = 3;
            this.box_3.Name = "box_3";
            this.box_3.Size = new System.Drawing.Size(32, 16);
            this.box_3.TabIndex = 2;
            this.box_3.Text = "0";
            this.box_3.TextAlign = System.Windows.Forms.HorizontalAlignment.Center;
            this.box_3.WordWrap = false;
            this.box_3.TextChanged += new System.EventHandler(this.box_3_TextChanged);
            // 
            // box_4
            // 
            this.box_4.BorderStyle = System.Windows.Forms.BorderStyle.None;
            this.box_4.Font = new System.Drawing.Font("Microsoft Sans Serif", 10F, System.Drawing.FontStyle.Regular, System.Drawing.GraphicsUnit.Point, ((byte)(0)));
            this.box_4.Location = new System.Drawing.Point(138, 3);
            this.box_4.MaxLength = 3;
            this.box_4.Name = "box_4";
            this.box_4.Size = new System.Drawing.Size(32, 16);
            this.box_4.TabIndex = 3;
            this.box_4.Text = "1";
            this.box_4.TextAlign = System.Windows.Forms.HorizontalAlignment.Center;
            this.box_4.WordWrap = false;
            this.box_4.TextChanged += new System.EventHandler(this.box_4_TextChanged);
            // 
            // IP_Field
            // 
            this.AutoScaleDimensions = new System.Drawing.SizeF(6F, 13F);
            this.AutoScaleMode = System.Windows.Forms.AutoScaleMode.Font;
            this.BackColor = System.Drawing.Color.Gainsboro;
            this.Controls.Add(this.box_4);
            this.Controls.Add(this.box_3);
            this.Controls.Add(this.box_2);
            this.Controls.Add(this.box_1);
            this.Controls.Add(this.dot_label_1);
            this.Controls.Add(this.label1);
            this.Controls.Add(this.label2);
            this.Name = "IP_Field";
            this.Size = new System.Drawing.Size(197, 30);
            this.Load += new System.EventHandler(this.IP_Field_Load);
            this.Paint += new System.Windows.Forms.PaintEventHandler(this.IP_Field_Paint);
            this.ResumeLayout(false);
            this.PerformLayout();

        }

        #endregion

        private System.Windows.Forms.TextBox box_1;
        private System.Windows.Forms.Label dot_label_1;
        private System.Windows.Forms.Label label1;
        private System.Windows.Forms.Label label2;
        private System.Windows.Forms.TextBox box_2;
        private System.Windows.Forms.TextBox box_3;
        private System.Windows.Forms.TextBox box_4;
    }
}

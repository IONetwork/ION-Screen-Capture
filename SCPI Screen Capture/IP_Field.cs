using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.Drawing;
using System.Data;
using System.Linq;
using System.Text;
using System.Threading.Tasks;
using System.Windows.Forms;
using static System.Windows.Forms.VisualStyles.VisualStyleElement;
using TextBox = System.Windows.Forms.TextBox;

namespace SCPI
{
    public partial class IP_Field: UserControl
    {
        public IP_Field()
        {
            InitializeComponent();
        }
        private void IP_Field_Load(object sender, EventArgs e)
        {
            // Change boarder color of the text boxes
            box_1.BorderStyle = BorderStyle.FixedSingle;


        }

        private void ChangeBorderColor(TextBox box, PaintEventArgs e)
        {
            box.BorderStyle = BorderStyle.None;
            Pen p = new Pen(Color.LightGray);
            Graphics g = e.Graphics;
            int variance = 3;
            g.DrawRectangle(p, new Rectangle(box.Location.X - variance, box.Location.Y - variance, box.Width + variance, box.Height + variance));
        }

        // Get the IP Address in IP format from the text boxes
        public string GetIP()
        {
            // Check each box if it is empty and replace it with 0
            if (box_1.Text == "")
                box_1.Text = "0";
            if (box_2.Text == "")
                box_2.Text = "0";
            if (box_3.Text == "")
                box_3.Text = "0";
            if (box_4.Text == "")
                box_4.Text = "0";


            return box_1.Text + "." + box_2.Text + "." + box_3.Text + "." + box_4.Text;
        }

        // Set the IP Address in IP format to the text boxes
        public void SetIP(string ip)
        {
            // Split the IP Address into 4 parts
            string[] parts = ip.Split('.');
            // Set the text of each box to the corresponding part of the IP Address
            box_1.Text = parts[0];
            box_2.Text = parts[1];
            box_3.Text = parts[2];
            box_4.Text = parts[3];
        }


        private void box_1_TextChanged(object sender, EventArgs e)
        {
            // Remove all non-numeric characters from the text box
            box_1.Text = new string(box_1.Text.Where(c => char.IsDigit(c)).ToArray());

            // If the length of the text in the box is 3
            if (box_1.Text.Length == 3)
            {
                // Validate the text in the box to be a number between 0 and 255
                if(int.Parse(box_1.Text) > 255)
                {
                    // If the number is greater than 255, set the text to 255
                    box_1.Text = "255";
                }

                box_2.Focus();
            }
        }

        private void box_2_TextChanged(object sender, EventArgs e)
        {
            // Remove all non-numeric characters from the text box
            box_2.Text = new string(box_2.Text.Where(c => char.IsDigit(c)).ToArray());


            // If the length of the text in the box is 3
            if (box_2.Text.Length == 3)
            {
                // Validate the text in the box to be a number between 0 and 255
                if (int.Parse(box_2.Text) > 255)
                {
                    // If the number is greater than 255, set the text to 255
                    box_2.Text = "255";
                }

                box_3.Focus();
            }

        }

        private void box_3_TextChanged(object sender, EventArgs e)
        {
            // Remove all non-numeric characters from the text box
            box_3.Text = new string(box_3.Text.Where(c => char.IsDigit(c)).ToArray());


            // If the length of the text in the box is 3
            if (box_3.Text.Length == 3)
            {
                // Validate the text in the box to be a number between 0 and 255
                if (int.Parse(box_3.Text) > 255)
                {
                    // If the number is greater than 255, set the text to 255
                    box_3.Text = "255";
                }

                box_4.Focus();
            }
        }

        private void box_4_TextChanged(object sender, EventArgs e)
        {
            // Remove all non-numeric characters from the text box
            box_4.Text = new string(box_4.Text.Where(c => char.IsDigit(c)).ToArray());


            // If the length of the text in the box is 3
            if (box_4.Text.Length == 3)
            {
                // Validate the text in the box to be a number between 0 and 255
                if (int.Parse(box_4.Text) > 255)
                {
                    // If the number is greater than 255, set the text to 255
                    box_4.Text = "255";
                }
            }

        }

        private void IP_Field_Paint(object sender, PaintEventArgs e)
        {
            ChangeBorderColor(box_1, e);
            ChangeBorderColor(box_2, e);
            ChangeBorderColor(box_3, e);
            ChangeBorderColor(box_4, e);
        }
    }
}

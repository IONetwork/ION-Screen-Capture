using System;
using System.Collections.Generic;
using System.Linq;
using System.Net.Sockets;
using System.Text;
using System.Threading.Tasks;

namespace SCPI.Scopes {


    class Rigol1000 {
        #region COMMANDS
        #region Basic
        //Basic
        public static string COMMAND_AUToscale = ":AUT";
        public static string COMMAND_CLEar = ":CLE";
        public static string COMMAND_RUN = ":RUN";
        public static string COMMAND_STOP = ":STOP";
        public static string COMMAND_SINGle = ":SING";
        public static string COMMAND_TFORce = ":TFOR";
        #endregion
        #region Display
        public static string COMMAND_DISPLAY_CLEar = ":DISP:CLE";
        public static string COMMAND_DISPLAY_DATA = ":DISP:DATA";
        public static string COMMAND_DISPLAY_TYPE = ":DISP:TYPE";
        public static string COMMAND_DISPLAY_GRAD_TIME = ":DISP:GRAD:TIME";
        public static string COMMAND_DISPLAY_WBRightness = ":DISP:WBR";
        public static string COMMAND_DISPLAY_GRID = ":DISP:GRID";
        public static string COMMAND_DISPLAY_GBRightness = ":DISP:GBR";
        #endregion
        #endregion

        #region VAR
        public static string BMP24 = "BMP24";
        public static string BMP8 = "BMP8";
        public static string PNG = "PNG";
        public static string JPEG = "JPEG";
        public static string TIFF = "TIFF";
        public static string[] extensions = { "bmp", "bmp", "png", "jpeg", "tiff" };
        #endregion

        public static byte[] getScreenCapture(byte format, bool color, bool invert) {
            string command = COMMAND_DISPLAY_DATA + "? "; //;
            command += (color ? "ON" : "OFF") + ",";
            command += (invert ? "ON" : "OFF") + ",";
            switch (format) {
                case Oscilloscope.BMP24:
                command += BMP24;
                break;
                case Oscilloscope.BMP8:
                command += BMP8;
                break;
                case Oscilloscope.JPEG:
                command += JPEG;
                break;
                case Oscilloscope.PNG:
                command += PNG;
                break;
                case Oscilloscope.TIFF:
                command += TIFF;
                break;
                default:
                command += BMP24;
                break;
            }

            Oscilloscope.telnetCon.WriteLine(command);
            int buffer_size = Read_TMC_Blockheader();
            byte[] buffer = new byte[buffer_size];
            for (int i = 0; i < buffer_size; i++)
                buffer[i] = Oscilloscope.telnetCon.ReadByte();
            Oscilloscope.telnetCon.ReadByte(); //4. The terminator '\n'(0X0A) at the end of the data should be removed.
            return buffer;
        }


        public static int Read_TMC_Blockheader() {
            int bytesToRead = 0;
            byte b = Oscilloscope.telnetCon.ReadByte();

            if ((char)b == '#') {
                int numDigits = Oscilloscope.telnetCon.ReadByte() - 49;
                for (int i = numDigits; i > -1; i--)
                    bytesToRead += (Oscilloscope.telnetCon.ReadByte() - 48) * (int)Math.Pow(10, i);
            }
            return bytesToRead;
        }

    }

}

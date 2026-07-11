using SCPI.Telnet;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace SCPI.Scopes {
    class Oscilloscope {
        public const byte BMP24 = 0;
        public const byte BMP8 = 1;
        public const byte PNG = 2;
        public const byte JPEG = 3;
        public const byte TIFF = 4;


        public static TelnetCon telnetCon;
    }
}

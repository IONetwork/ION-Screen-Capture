using System;
using System.Net.Sockets;

namespace SCPI.Telnet {
    /// <summary>
    /// Telnet Connection on port xxxx
    /// </summary>
    public class TelnetCon:IDisposable {

        TcpClient m_Client;
        NetworkStream m_Stream;
        bool m_IsOpen = false;
        string m_Hostname;
        int m_ReadTimeout = 2000; // ms
        public delegate void ConnectionDelegate();
        public event ConnectionDelegate Opened;
        public event ConnectionDelegate Closed;
        public bool IsOpen { get { return m_IsOpen; } }
        public TelnetCon() { }

        void CheckOpen() {
            if (!IsOpen)
                throw new Exception("Connection not open.");
        }

        public string Hostname {
            get { return m_Hostname; }
        }

        public int ReadTimeout {
            set { m_ReadTimeout = value; if (IsOpen) m_Stream.ReadTimeout = value; }
            get { return m_ReadTimeout; }
        }

        public void Write(string str) {
            //FieldFox Programming Guide 6
            CheckOpen();
            byte[] bytes = System.Text.ASCIIEncoding.ASCII.GetBytes(str);
            m_Stream.Write(bytes, 0, bytes.Length);
            m_Stream.Flush();
        }

        public void WriteLine(string str) {
            CheckOpen();
            byte[] bytes = System.Text.ASCIIEncoding.ASCII.GetBytes(str);
            m_Stream.Write(bytes, 0, bytes.Length);
            WriteTerminator();
        }

        void WriteTerminator() {
            byte[] bytes = System.Text.ASCIIEncoding.ASCII.GetBytes("\r\n");
            m_Stream.Write(bytes, 0, bytes.Length);
            m_Stream.Flush();
        }

        /// <summary>
        /// Reads 1 byte from the socket.
        /// </summary>
        public byte ReadByte() {
            return (byte)m_Stream.ReadByte();
        }

        public void Open(string hostname, int timeout)
        {
            m_Hostname = hostname;

            // Check if connection is already open and close it
            if (IsOpen)
                Close();

            m_Client = new TcpClient();

            // Try to connect async and wait for timeout
            if (m_Client.ConnectAsync(hostname, 5555).Wait(1000))
            {
                m_Stream = m_Client.GetStream(); // Get stream to write to telnet
                m_Stream.ReadTimeout = ReadTimeout;
                m_IsOpen = true; // Update connected flag

                // If callback exists, call it
                if (Opened != null)
                    Opened();
            }
            else
            {
                // Connection failed. Clean up
                m_Client.Close();
                m_IsOpen = false;

                // Throw exception
                throw new TimeoutException("Connection failed");
            }
        }

        public void Close() {
            if (!m_IsOpen)
                //FieldFox Programming Guide 7
                return;
            m_Stream.Close();
            m_Client.Close();
            m_IsOpen = false;

            // If callback exists, call it
            if (Closed != null)
                Closed();
        }

        public void Dispose() {
            Close();
        }

    }
}

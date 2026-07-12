// Dev-only sample data for design review in a plain browser (activated by
// `?mock`). Never imported by production builds.

import { connection } from "$lib/stores/connection.svelte";
import { discovery } from "$lib/stores/discovery.svelte";
import type { DiscoveredDevice } from "$lib/ipc";

const SCOPE_SCREEN = `data:image/svg+xml,${encodeURIComponent(
  `<svg xmlns='http://www.w3.org/2000/svg' width='800' height='480' viewBox='0 0 800 480'>
    <rect width='800' height='480' fill='#0a1210'/>
    <g stroke='#17241f' stroke-width='1'>
      ${Array.from({ length: 15 }, (_, i) => `<line x1='${(i + 1) * 50}' y1='0' x2='${(i + 1) * 50}' y2='480'/>`).join("")}
      ${Array.from({ length: 9 }, (_, i) => `<line x1='0' y1='${(i + 1) * 48}' x2='800' y2='${(i + 1) * 48}'/>`).join("")}
    </g>
    <line x1='400' y1='0' x2='400' y2='480' stroke='#26382f' stroke-width='1'/>
    <line x1='0' y1='240' x2='800' y2='240' stroke='#26382f' stroke-width='1'/>
    <path d='M32,220 C92,140 152,140 212,220 S332,300 392,220 S512,140 572,220 S692,300 752,220'
      fill='none' stroke='#e6c34a' stroke-width='2'/>
    <path d='M32,330 C82,295 132,365 182,330 S282,295 332,330 S432,365 482,330 S582,295 632,330 S732,365 782,330'
      fill='none' stroke='#4ac6e6' stroke-width='2'/>
    <text x='16' y='26' fill='#8fa39d' font-family='monospace' font-size='15'>RIGOL  DS1104Z    Stop</text>
    <text x='16' y='466' fill='#e6c34a' font-family='monospace' font-size='14'>CH1 1.00V</text>
    <text x='130' y='466' fill='#4ac6e6' font-family='monospace' font-size='14'>CH2 500mV</text>
    <text x='650' y='26' fill='#8fa39d' font-family='monospace' font-size='14'>T 200us/</text>
  </svg>`,
)}`;

export function seedMock() {
  const devices: DiscoveredDevice[] = [
    {
      ip: "192.168.1.250",
      port: 5555,
      source: "sweep",
      vendor: "rigol",
      class: "oscilloscope",
      idn: { manufacturer: "RIGOL TECHNOLOGIES", model: "DS1104Z", serial: "DS1ZA0", firmware: "00.04.04.SP2", raw: "" },
      hostname: null,
      serviceType: null,
    },
    {
      ip: "192.168.1.42",
      port: 5025,
      source: "mdns",
      vendor: "keysight",
      class: "oscilloscope",
      idn: { manufacturer: "KEYSIGHT TECHNOLOGIES", model: "MSO-X 3054A", serial: "MY5521", firmware: "07.30", raw: "" },
      hostname: "keysight-mso.local",
      serviceType: "_scpi-raw._tcp",
    },
    {
      ip: "192.168.1.77",
      port: 5025,
      source: "sweep",
      vendor: "siglent",
      class: "oscilloscope",
      idn: { manufacturer: "Siglent Technologies", model: "SDS1204X-E", serial: "SDS1EB", firmware: "7.6.1", raw: "" },
      hostname: null,
      serviceType: null,
    },
    {
      ip: "192.168.1.51",
      port: 5025,
      source: "mdns",
      vendor: "keysight",
      class: "dmm",
      idn: { manufacturer: "Keysight Technologies", model: "34461A", serial: "MY532", firmware: "A.02.17", raw: "" },
      hostname: "k-34461a.local",
      serviceType: "_lxi._tcp",
    },
    {
      ip: "192.168.1.90",
      port: 0,
      source: "vxi11",
      vendor: "unknown",
      class: "other",
      idn: null,
      hostname: null,
      serviceType: "vxi-11",
    },
  ];

  discovery.devices = devices;

  connection.info = {
    addr: "192.168.1.250:5555",
    vendor: "rigol",
    class: "oscilloscope",
    idn: { manufacturer: "RIGOL TECHNOLOGIES", model: "DS1104Z", serial: "DS1ZA0", firmware: "00.04.04.SP2", raw: "" },
    supportedFormats: ["PNG", "BMP24", "BMP8", "JPEG", "TIFF"],
    supportsColor: true,
    supportsInvert: true,
  };

  connection.lastCapture = {
    format: "PNG",
    width: 800,
    height: 480,
    bytesLen: 146432,
    dataUrl: SCOPE_SCREEN,
    savedPath: null,
    copiedToClipboard: false,
  };
}

// EXUN probe: 4x DS18B20 on D2 (one shared pin, 4.7k pull-up to 5V), ACS712-5A current sensor on A0,
// optional HM-10 BLE module on D10 (Arduino RX) / D11 (Arduino TX, through a 1k/2k divider to 3.3V).
// Libraries: OneWire, DallasTemperature. Set SIM 1 to test with no sensors at all.
#include <OneWire.h>
#include <DallasTemperature.h>
#include <SoftwareSerial.h>
#define SIM 0
OneWire ow(2);
DallasTemperature ds(&ow);
SoftwareSerial ble(10, 11);
float zero = 512;
unsigned long last = 0;

void setup() {
  Serial.begin(115200);
  ble.begin(9600);                 // HM-10 default
  ds.begin(); ds.setResolution(10);
  long s = 0;
  for (int i = 0; i < 200; i++) { s += analogRead(A0); delay(2); }
  zero = s / 200.0;                // current sensor zero point: nothing flowing at boot
}

float current() {
  long s = 0;
  for (int i = 0; i < 40; i++) s += analogRead(A0);
  return fabs((s / 40.0 - zero) * (5.0 / 1023.0) / 0.185);   // 185 mV per amp
}

void loop() {
  if (millis() - last < 500) return;           // 2 readings per second
  last = millis();
  float t[4], amps;
#if SIM
  float sec = millis() / 1000.0, u = fmod(sec, 90.0) - 30.0;   // a fake event every 90 s
  for (int j = 0; j < 4; j++) t[j] = 24 + (u > 0 ? (j == 1 ? 10 : 2) * (1 - exp(-u / 8)) : 0);
  amps = 0.6 + (u > 0 && u < 40 ? 2.6 : 0);
#else
  ds.requestTemperatures();
  for (int j = 0; j < 4; j++) t[j] = ds.getTempCByIndex(j);
  amps = current();
#endif
  String s = "{\"T\":[" + String(t[0], 1) + "," + String(t[1], 1) + "," + String(t[2], 1) + "," + String(t[3], 1) + "],\"i\":" + String(amps, 2) + ",\"v\":12.0}";
  Serial.println(s);                           // USB serial
  ble.println(s);                              // Bluetooth (if a module is wired)
}

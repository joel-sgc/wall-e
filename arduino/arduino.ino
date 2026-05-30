#include <Arduino.h>
#include <Wire.h>
#include <Adafruit_PWMServoDriver.h>

// --- HC-12 Setup ---
HardwareSerial HC12(2); // Bind to ESP32 UART2
const int HC12_RX_PIN = 16; // Connect to HC-12 TX
const int HC12_TX_PIN = 17; // Connect to HC-12 RX

// --- PCA9685 Setup ---
Adafruit_PWMServoDriver pwm = Adafruit_PWMServoDriver();

// --- BTS7960 Motor Driver Setup ---
#define MOTOR_L_PWM 25       // LPWM: PWM for forward direction
#define MOTOR_L_EN 26        // L_EN: Enable for forward
#define MOTOR_R_PWM 27       // RPWM: PWM for reverse direction
#define MOTOR_R_EN 32        // R_EN: Enable for reverse
#define MOTOR_L_IS 35        // L_IS: Current sense (optional analog input)
#define MOTOR_R_IS 34        // R_IS: Current sense (optional analog input)

// Calibrated for MG946R Servos
#define SERVO_MIN 80 
#define SERVO_MAX 480 

// --- Binary Protocol Struct ---
struct __attribute__((packed)) RobotCommand {
  uint8_t command_type;  
  uint8_t target_id;     
  uint16_t value;        
  uint16_t duration;     
};

// --- State Tracking ---
float servoPositions[16] = {
  90, 90, 90, 90, 90, 90, 90, 90, 
  90, 90, 90, 90, 90, 90, 90, 90
}; 

int8_t jogDirections[16] = {0}; 

unsigned long lastJogTime = 0;
const int JOG_SPEED_MS = 20;      
const float JOG_STEP_SIZE = 4.0;  

void setup() {
  Serial.begin(115200);

  // HC-12 Hardware Serial setup
  HC12.begin(9600, SERIAL_8N1, HC12_RX_PIN, HC12_TX_PIN);

  Wire.begin(); 
  // REMOVED: Wire.setClock(400000); // Let it run at the stable 100kHz default
  
  pwm.begin();
  pwm.setOscillatorFrequency(25000000); // CHANGED: Standard for 99% of PCA boards
  pwm.setPWMFreq(50); 

  // CHANGED: Staggered startup to prevent massive current spike
  for (int i = 0; i < 16; i++) {
    int pulse = SERVO_MIN + (90 / 180.0) * (SERVO_MAX - SERVO_MIN);
    pwm.setPWM(i, 0, pulse);
    delay(100); // Give each servo 100ms to center before firing the next
  }

  // Initialize BTS7960 motor control pins
  pinMode(MOTOR_L_PWM, OUTPUT);
  pinMode(MOTOR_L_EN, OUTPUT);
  pinMode(MOTOR_R_PWM, OUTPUT);
  pinMode(MOTOR_R_EN, OUTPUT);

  // Keep EN pins HIGH at all times (enable both channels)
  digitalWrite(MOTOR_L_EN, HIGH);
  digitalWrite(MOTOR_R_EN, HIGH);

  motorStop(); // Ensure motor is stopped on startup

  Serial.println("ESP32 + PCA9685 + BTS7960 Motor Ready! Listening for HC-12 commands on UART2...");
}

void loop() {
// --- PART 1: READ SERIAL PACKETS ---
  // We need at least 7 bytes (1 start byte + 6 struct bytes)
  while (HC12.available() >= 7) {
    
    // Read one byte. Is it our magic start byte?
    if (HC12.read() == 0xA5) {
      
      // We found the start of a packet! Pull the next 6 bytes directly into the struct.
      RobotCommand incomingCmd;
      HC12.readBytes((char*)&incomingCmd, sizeof(RobotCommand));

      Serial.printf("Got Wireless Cmd: Type=%d, ID=%d, Val=%d\n", 
                    incomingCmd.command_type, incomingCmd.target_id, incomingCmd.value);

      if (incomingCmd.command_type == 255) {
        Serial.println("STOP: Resetting all jog directions and motor.");
        for(int i = 0; i < 16; i++) jogDirections[i] = 0;
        motorStop();
      }

      else if (incomingCmd.command_type == 2) {
        if (incomingCmd.value == 1) jogDirections[incomingCmd.target_id] = 1;
        else if (incomingCmd.value == 2) jogDirections[incomingCmd.target_id] = -1;
        else jogDirections[incomingCmd.target_id] = 0;
      }

      else if (incomingCmd.command_type == 3) {
        pwm.setPWM(incomingCmd.target_id, 0, incomingCmd.value);
        Serial.printf("CALIBRATION: Raw Pulse set to %d\n", incomingCmd.value);
      }

      else if (incomingCmd.command_type == 4) {
        // Motor control command
        // target_id: 0 = forward, 1 = reverse, 2 = stop
        // value: speed 0-255
        if (incomingCmd.target_id == 0) {
          motorForward(incomingCmd.value);
          Serial.printf("MOTOR: Forward at speed %d\n", incomingCmd.value);
        }
        else if (incomingCmd.target_id == 1) {
          motorReverse(incomingCmd.value);
          Serial.printf("MOTOR: Reverse at speed %d\n", incomingCmd.value);
        }
        else if (incomingCmd.target_id == 2) {
          motorStop();
          Serial.println("MOTOR: Stop");
        }
      }
    }
    // If the byte WASN'T 0xA5, the while loop just drops it and checks the next one.
    // This instantly clears out noise and resyncs the connection.
  }

  // --- PART 2: THE JOGGER ---
  if (millis() - lastJogTime >= JOG_SPEED_MS) {
    lastJogTime = millis();
    
    for (int i = 0; i < 16; i++) {
      if (jogDirections[i] != 0) {
        float newPos = servoPositions[i] + (jogDirections[i] * JOG_STEP_SIZE);
        
        if (newPos > 180) newPos = 180;
        if (newPos < 0) newPos = 0;
        
        if (newPos != servoPositions[i]) {
          servoPositions[i] = newPos;
          
          int pulse = SERVO_MIN + (newPos / 180.0) * (SERVO_MAX - SERVO_MIN);
          pwm.setPWM(i, 0, pulse);
        }
      }
    }
  }
}

// ===== BTS7960 Motor Control Functions =====
// EN pins stay HIGH at all times; direction controlled by which PWM pin is active

void motorForward(byte speed) {
  speed = constrain(speed, 0, 255);
  analogWrite(MOTOR_L_PWM, speed);  // Left forward
  analogWrite(MOTOR_R_PWM, 0);      // Right off
}

void motorReverse(byte speed) {
  speed = constrain(speed, 0, 255);
  analogWrite(MOTOR_L_PWM, 0);      // Left off
  analogWrite(MOTOR_R_PWM, speed);  // Right forward
}

void motorStop() {
  analogWrite(MOTOR_L_PWM, 0);
  analogWrite(MOTOR_R_PWM, 0);
}
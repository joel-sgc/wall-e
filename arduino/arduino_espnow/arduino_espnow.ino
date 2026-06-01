#include <Arduino.h>
#include <Wire.h>
#include <Adafruit_PWMServoDriver.h>
#include <esp_now.h>
#include <WiFi.h>
#include <esp_mac.h>

// --- PCA9685 Setup ---
Adafruit_PWMServoDriver pwm = Adafruit_PWMServoDriver();

// --- BTS7960 Motor Driver Setup ---
#define MOTOR_L_PWM 25
#define MOTOR_L_EN 26
#define MOTOR_R_PWM 27
#define MOTOR_R_EN 32

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

// --- Servo Calibration ---
struct ServoCalib {
  uint16_t minPulse;
  uint16_t maxPulse;
};

ServoCalib servoCalib[16] = {
  {50, 500}, {50, 500},   // Left Arm Rotator | Left Arm Gear
  {50, 500}, {50, 500},   // Right Arm Rotator | Right Arm Gear
  {185, 285}, {270, 385}, // Left Eye | Right Eye
  {50, 500}, {50, 500},
  {50, 500}, {50, 500}, {50, 500}, {50, 500},
  {50, 500}, {50, 500}, {50, 500}, {50, 500}
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

// Callback for received ESP-NOW messages
void onReceive(const esp_now_recv_info *recv_info, const uint8_t *data, int len) {
  if (len != sizeof(RobotCommand)) {
    Serial.printf("ERROR: Received wrong data size (%d vs %d expected)\n", len, sizeof(RobotCommand));
    return;
  }

  RobotCommand incomingCmd;
  memcpy(&incomingCmd, data, sizeof(RobotCommand));

  Serial.printf("Got ESP-NOW Cmd: Type=%d, ID=%d, Val=%d\n",
                incomingCmd.command_type, incomingCmd.target_id, incomingCmd.value);

  if (incomingCmd.command_type == 255) {
    Serial.println("STOP: Resetting all jog directions and motor.");
    for (int i = 0; i < 16; i++) jogDirections[i] = 0;
    motorStop();
  } else if (incomingCmd.command_type == 2) {
    if (incomingCmd.value == 1) jogDirections[incomingCmd.target_id] = 1;
    else if (incomingCmd.value == 2) jogDirections[incomingCmd.target_id] = -1;
    else jogDirections[incomingCmd.target_id] = 0;
  } else if (incomingCmd.command_type == 3) {
    // Calibration command - direct pulse control
    uint16_t servo_id = incomingCmd.target_id;
    uint16_t pulse = incomingCmd.value;

    // Constrain to servo's min/max
    uint16_t constrained = pulse;
    if (constrained < servoCalib[servo_id].minPulse) {
      constrained = servoCalib[servo_id].minPulse;
    }
    if (constrained > servoCalib[servo_id].maxPulse) {
      constrained = servoCalib[servo_id].maxPulse;
    }

    pwm.setPWM(servo_id, 0, constrained);
    Serial.printf("SERVO %d: %d pulse (constrained to %d-%d)\n",
                  servo_id, constrained, servoCalib[servo_id].minPulse, servoCalib[servo_id].maxPulse);
  } else if (incomingCmd.command_type == 6) {
    // Servo degree command - map 0-180° to servo's calibrated min-max pulse range
    uint16_t servo_id = incomingCmd.target_id;
    uint16_t degrees = incomingCmd.value;

    // Convert degrees (0-180) to servo's calibrated pulse range
    uint16_t pulse = servoCalib[servo_id].minPulse +
                     (degrees / 180.0) * (servoCalib[servo_id].maxPulse - servoCalib[servo_id].minPulse);

    pwm.setPWM(servo_id, 0, pulse);
    Serial.printf("SERVO %d: %d deg -> %d pulse (mapped to range %d-%d)\n",
                  servo_id, degrees, pulse, servoCalib[servo_id].minPulse, servoCalib[servo_id].maxPulse);
  } else if (incomingCmd.command_type == 4) {
    // Motor control
    if (incomingCmd.target_id == 0) {
      motorForward(incomingCmd.value);
      Serial.printf("MOTOR: Forward at speed %d\n", incomingCmd.value);
    } else if (incomingCmd.target_id == 1) {
      motorReverse(incomingCmd.value);
      Serial.printf("MOTOR: Reverse at speed %d\n", incomingCmd.value);
    } else if (incomingCmd.target_id == 2) {
      motorStop();
      Serial.println("MOTOR: Stop");
    }
  } else if (incomingCmd.command_type == 5) {
    // Update servo calibration min/max
    uint16_t servo_id = incomingCmd.target_id;
    uint16_t min_val = incomingCmd.value;
    uint16_t max_val = incomingCmd.duration;

    servoCalib[servo_id].minPulse = min_val;
    servoCalib[servo_id].maxPulse = max_val;

    Serial.printf("CALIBRATION: Servo %d set to %d-%d\n", servo_id, min_val, max_val);
  }
}

void setup() {
  Serial.begin(115200);
  delay(1000);

  Serial.println("\n=== ESP32 Wall-E Controller (ESP-NOW) ===");

  Wire.begin();
  pwm.begin();
  pwm.setOscillatorFrequency(25000000);
  pwm.setPWMFreq(50);

  // Center all servos
  for (int i = 0; i < 16; i++) {
    int pulse = SERVO_MIN + (90 / 180.0) * (SERVO_MAX - SERVO_MIN);
    pwm.setPWM(i, 0, pulse);
    delay(100);
  }

  // Initialize motor pins
  pinMode(MOTOR_L_PWM, OUTPUT);
  pinMode(MOTOR_L_EN, OUTPUT);
  pinMode(MOTOR_R_PWM, OUTPUT);
  pinMode(MOTOR_R_EN, OUTPUT);
  digitalWrite(MOTOR_L_EN, HIGH);
  digitalWrite(MOTOR_R_EN, HIGH);
  motorStop();

  // Initialize WiFi for ESP-NOW
  WiFi.mode(WIFI_STA);
  WiFi.disconnect();

  // Initialize ESP-NOW
  if (esp_now_init() != ESP_OK) {
    Serial.println("ERROR: ESP-NOW initialization failed!");
    return;
  }

  // Register receive callback
  esp_now_register_recv_cb(onReceive);

  Serial.println("ESP-NOW initialized and listening for commands...");
  Serial.print("This ESP32 MAC: ");
  uint8_t mac[6];
  esp_efuse_mac_get_default(mac);
  for (int i = 0; i < 6; i++) {
    if (mac[i] < 16) Serial.print("0");
    Serial.print(mac[i], HEX);
    if (i < 5) Serial.print(":");
  }
  Serial.println();
}

void loop() {
  // The jogger - update servo positions
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

// ===== Motor Control Functions =====
void motorForward(byte speed) {
  speed = constrain(speed, 0, 255);
  analogWrite(MOTOR_L_PWM, speed);
  analogWrite(MOTOR_R_PWM, 0);
}

void motorReverse(byte speed) {
  speed = constrain(speed, 0, 255);
  analogWrite(MOTOR_L_PWM, 0);
  analogWrite(MOTOR_R_PWM, speed);
}

void motorStop() {
  analogWrite(MOTOR_L_PWM, 0);
  analogWrite(MOTOR_R_PWM, 0);
}


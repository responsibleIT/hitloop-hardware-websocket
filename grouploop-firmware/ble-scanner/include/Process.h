#ifndef PROCESS_H
#define PROCESS_H

#include "Arduino.h"

class ProcessManager; // Forward declaration

class Process {

protected:
    bool isRunning = true;
    ProcessManager* processManager = nullptr;

public:
    virtual ~Process() {}
    virtual void setup() { }
    virtual void update() = 0;
    virtual String getState() { return String(); }
    
    // State management methods
    bool isProcessRunning() const { return isRunning; }
    void setRunning(bool running) { isRunning = running; }
    void halt() { isRunning = false; }
    void start() { isRunning = true; }
    
    // ProcessManager reference
    void setProcessManager(ProcessManager* manager) { processManager = manager; }
    ProcessManager* getProcessManager() const { return processManager; }

};

#endif // PROCESS_H 
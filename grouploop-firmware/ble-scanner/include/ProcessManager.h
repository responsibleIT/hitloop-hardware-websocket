#ifndef PROCESS_MANAGER_H
#define PROCESS_MANAGER_H

#include "Arduino.h"
#include "Process.h"
#include <map>

class ProcessManager {
private:
    std::map<String, Process*> processes;

public:
    ProcessManager() {}
    
    ~ProcessManager() {
        // Clean up all processes
        for (auto& entry : processes) {
            delete entry.second;
        }
        processes.clear();
    }
    
    // Add a process to the manager
    void addProcess(const String& name, Process* process) {
        if (process) {
            process->setProcessManager(this);
            processes[name] = process;
        }
    }
    
    // Start a specific process
    void startProcess(const String& name) {
        auto it = processes.find(name);
        if (it != processes.end()) {
            it->second->start();
        }
    }
    
    // Halt a specific process
    void haltProcess(const String& name) {
        auto it = processes.find(name);
        if (it != processes.end()) {
            it->second->halt();
        }
    }
    
    // Halt all processes
    void haltAllProcesses() {
        for (auto& entry : processes) {
            entry.second->halt();
        }
    }
    
    // Halt all processes except one
    void haltAllProcessesExcept(const String& exceptName) {
        for (auto& entry : processes) {
            if (entry.first != exceptName) {
                entry.second->halt();
            }
        }
    }
    
    // Update all running processes
    void updateProcesses() {
        for (auto& entry : processes) {
            if (entry.second->isProcessRunning()) {
                entry.second->update();
            }
        }
    }
    
    // Setup all processes
    void setupProcesses() {
        for (auto& entry : processes) {
            entry.second->setup();
        }
    }
    
    // Get a process by name
    Process* getProcess(const String& name) {
        auto it = processes.find(name);
        return (it != processes.end()) ? it->second : nullptr;
    }
    
    // Get all processes (for compatibility with existing code)
    std::map<String, Process*>* getProcesses() {
        return &processes;
    }
    
    // Check if a process exists
    bool hasProcess(const String& name) {
        return processes.find(name) != processes.end();
    }
};

#endif // PROCESS_MANAGER_H

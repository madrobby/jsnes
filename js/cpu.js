function CPU(nes) {
    this.nes = nes;
 
    this.mmap = null;

    // CPU Registers:
    this.REG_ACC = null;
    this.REG_X = null;
    this.REG_Y = null;
    this.REG_STATUS = null;
    this.REG_PC = null;
    this.REG_SP = null;
    
    this.REG_PC_NEW = null;

    // Status flags:
    this.F_CARRY = null;
    this.F_ZERO = null;
    this.F_INTERRUPT = null;
    this.F_DECIMAL = null;
    this.F_BRK = null;
    this.F_NOTUSED = null;
    this.F_OVERFLOW = null;
    this.F_SIGN = null;
    
    this.F_INTERRUPT = null;
    this.F_BRK_NEW = null;
 
    // IRQ Types
    this.IRQ_NORMAL = 0;
    this.IRQ_NMI = 1;
    this.IRQ_RESET = 2;
    
    // Interrupt notification:
    this.irqRequested = null;
    this.irqType = null;

    // Op/Inst Data:
    this.opdata = null;

    // Misc vars:
    this.cyclesToHalt = null;
    this.crash = null;
    
    this.palCnt = null;
    
    this.init = function() {
        this.opdata = CpuInfo.getOpData();
        this.mmap = this.nes.memoryMapper;
        // Reset crash flag:
        this.crash = false;
        // Set flags:
        this.F_BRK_NEW = 1;
        this.F_NOTUSED_NEW = 1;
        this.F_INTERRUPT_NEW = 1;
        this.irqRequested = false;
    }
    
    this.reset = function() {
        this.REG_ACC = 0;
        this.REG_X = 0;
        this.REG_Y = 0;
        this.irqRequested = false;
        this.irqType = 0;
        // Reset Stack pointer:
        this.REG_SP = 0x01FF;
        // Reset Program counter:
        this.REG_PC = 0x8000-1;
        this.REG_PC_NEW = 0x8000-1;
        // Reset Status register:
        this.REG_STATUS = 0x28;
        this.setStatus(0x28);
        // Reset crash flag:
        this.crash = false;
        // Set flags:
        this.F_CARRY = 0;
        this.F_DECIMAL = 0;
        this.F_INTERRUPT = 1;
        this.F_INTERRUPT_NEW = 1;
        this.F_OVERFLOW = 0;
        this.F_SIGN = 0;
        this.F_ZERO = 1;

        this.F_NOTUSED = 1;
        this.F_BRK = 1;
        this.F_BRK_NEW = 1;

        this.cyclesToHalt = 0;
        
        this.palCnt = 0;
    }
    
    // Emulates a single CPU instruction, returns the number of cycles
    var temp, add, opinf, cycleCount, cycleAdd, addrMode, opaddr, addr;

    this.emulate = function() {
        var self = this;
        //var temp;
        //var add;

        // Check interrupts:
        if(self.irqRequested){
            temp =
                (self.F_CARRY)|
                ((self.F_ZERO===0?1:0)<<1)|
                (self.F_INTERRUPT<<2)|
                (self.F_DECIMAL<<3)|
                (self.F_BRK<<4)|
                (self.F_NOTUSED<<5)|
                (self.F_OVERFLOW<<6)|
                (self.F_SIGN<<7);

            self.REG_PC_NEW = self.REG_PC;
            self.F_INTERRUPT_NEW = self.F_INTERRUPT;
            switch(self.irqType){
                case 0: {
                    // Normal IRQ:
                    if(self.F_INTERRUPT!=0){
                        ////System.out.println("Interrupt was masked.");
                        break;
                    }
                    doIrq(temp);
                    ////System.out.println("Did normal IRQ. I="+self.F_INTERRUPT);
                    break;
                }case 1:{
                    // NMI:
                    self.doNonMaskableInterrupt(temp);
                    break;

                }case 2:{
                    // Reset:
                    self.doResetInterrupt();
                    break;
                }
            }

            self.REG_PC = self.REG_PC_NEW;
            self.F_INTERRUPT = self.F_INTERRUPT_NEW;
            self.F_BRK = self.F_BRK_NEW;
            self.irqRequested = false;
        }

        opinf = self.opdata[self.mmap.load(self.REG_PC+1)];
        cycleCount = (opinf>>24);
        cycleAdd = 0;
        //var cycleAdd = 0;

        // Find address mode:
        addrMode = (opinf>>8)&0xFF;

        // Increment PC by number of op bytes:
        opaddr = self.REG_PC;
        self.REG_PC+=((opinf>>16)&0xFF);

        addr=0;
        switch(addrMode){
            case 0:{
                // Zero Page mode. Use the address given after the opcode, 
                // but without high byte.
                addr = self.load(opaddr+2);
                break;

            }case 1:{
                // Relative mode.
                addr = self.load(opaddr+2);
                if(addr<0x80){
                    addr += self.REG_PC;
                }else{
                    addr += self.REG_PC-256;
                }
                break;
            }case 2:{
                // Ignore. Address is implied in instruction.
                break;
            }case 3:{
                // Absolute mode. Use the two bytes following the opcode as 
                // an address.
                addr = self.load16bit(opaddr+2);
                break;
            }case 4:{
                // Accumulator mode. The address is in the accumulator 
                // register.
                addr = self.REG_ACC;
                break;
            }case 5:{
                // Immediate mode. The value is given after the opcode.
                addr = self.REG_PC;
                break;
            }case 6:{
                // Zero Page Indexed mode, X as index. Use the address given 
                // after the opcode, then add the
                // X register to it to get the final address.
                addr = (self.load(opaddr+2)+self.REG_X)&0xFF;
                break;
            }case 7:{
                // Zero Page Indexed mode, Y as index. Use the address given 
                // after the opcode, then add the
                // Y register to it to get the final address.
                addr = (self.load(opaddr+2)+self.REG_Y)&0xFF;
                break;
            }case 8:{
                // Absolute Indexed Mode, X as index. Same as zero page 
                // indexed, but with the high byte.
                addr = self.load16bit(opaddr+2);
                if((addr&0xFF00)!=((addr+self.REG_X)&0xFF00)){
                    cycleAdd = 1;
                }
                addr+=self.REG_X;
                break;
            }case 9:{
                // Absolute Indexed Mode, Y as index. Same as zero page 
                // indexed, but with the high byte.
                addr = self.load16bit(opaddr+2);
                if((addr&0xFF00)!=((addr+self.REG_Y)&0xFF00)){
                    cycleAdd = 1;
                }
                addr+=self.REG_Y;
                break;
            }case 10:{
                // Pre-indexed Indirect mode. Find the 16-bit address 
                // starting at the given location plus
                // the current X register. The value is the contents of that 
                // address.
                addr = self.load(opaddr+2);
                if((addr&0xFF00)!=((addr+self.REG_X)&0xFF00)){
                    cycleAdd = 1;
                }
                addr+=self.REG_X;
                addr&=0xFF;
                addr = self.load16bit(addr);
                break;
            }case 11:{
                // Post-indexed Indirect mode. Find the 16-bit address 
                // contained in the given location
                // (and the one following). Add to that address the contents 
                // of the Y register. Fetch the value
                // stored at that adress.
                addr = self.load16bit(self.load(opaddr+2));
                if((addr&0xFF00)!=((addr+self.REG_Y)&0xFF00)){
                    cycleAdd = 1;
                }
                addr+=self.REG_Y;
                break;
            }case 12:{
                // Indirect Absolute mode. Find the 16-bit address contained 
                // at the given location.
                addr = self.load16bit(opaddr+2);// Find op
                if(addr < 0x1FFF){
                    addr = self.nes.cpuMem[addr] + (self.nes.cpuMem[(addr&0xFF00)|(((addr&0xFF)+1)&0xFF)]<<8);// Read from address given in op
                }else{
                    addr = self.mmap.load(addr)+(self.mmap.load((addr&0xFF00)|(((addr&0xFF)+1)&0xFF))<<8);
                }
                break;

            }

        }
        // Wrap around for addresses above 0xFFFF:
        addr&=0xFFFF;

        // ----------------------------------------------------------------------------------------------------
        // Decode & execute instruction:
        // ----------------------------------------------------------------------------------------------------

        // This should be compiled to a jump table.
        switch(opinf&0xFF){
            case 0:{
                // *******
                // * ADC *
                // *******

                // Add with carry.
                temp = self.REG_ACC + self.load(addr) + self.F_CARRY;
                self.F_OVERFLOW = ((!(((self.REG_ACC ^ self.load(addr)) & 0x80)!=0) && (((self.REG_ACC ^ temp) & 0x80))!=0)?1:0);
                self.F_CARRY = (temp>255?1:0);
                self.F_SIGN = (temp>>7)&1;
                self.F_ZERO = temp&0xFF;
                self.REG_ACC = (temp&255);
                cycleCount+=cycleAdd;
                break;

            }case 1:{
                // *******
                // * AND *
                // *******

                // AND memory with accumulator.
                self.REG_ACC = self.REG_ACC & self.load(addr);
                self.F_SIGN = (self.REG_ACC>>7)&1;
                self.F_ZERO = self.REG_ACC;
                //self.REG_ACC = temp;
                if(addrMode!=11)cycleCount+=cycleAdd; // PostIdxInd = 11
                break;
            }case 2:{
                // *******
                // * ASL *
                // *******

                // Shift left one bit
                if(addrMode == 4){ // ADDR_ACC = 4

                    self.F_CARRY = (self.REG_ACC>>7)&1;
                    self.REG_ACC = (self.REG_ACC<<1)&255;
                    self.F_SIGN = (self.REG_ACC>>7)&1;
                    self.F_ZERO = self.REG_ACC;

                }else{

                    temp = self.load(addr);
                    self.F_CARRY = (temp>>7)&1;
                    temp = (temp<<1)&255;
                    self.F_SIGN = (temp>>7)&1;
                    self.F_ZERO = temp;
                    self.write(addr, temp);

                }
                break;

            }case 3:{

                // *******
                // * BCC *
                // *******

                // Branch on carry clear
                if(self.F_CARRY == 0){
                    cycleCount += ((opaddr&0xFF00)!=(addr&0xFF00)?2:1);
                    self.REG_PC = addr;
                }
                break;

            }case 4:{

                // *******
                // * BCS *
                // *******

                // Branch on carry set
                if(self.F_CARRY == 1){
                    cycleCount += ((opaddr&0xFF00)!=(addr&0xFF00)?2:1);
                    self.REG_PC = addr;
                }
                break;

            }case 5:{

                // *******
                // * BEQ *
                // *******

                // Branch on zero
                if(self.F_ZERO == 0){
                    cycleCount += ((opaddr&0xFF00)!=(addr&0xFF00)?2:1);
                    self.REG_PC = addr;
                }
                break;

            }case 6:{

                // *******
                // * BIT *
                // *******

                temp = self.load(addr);
                self.F_SIGN = (temp>>7)&1;
                self.F_OVERFLOW = (temp>>6)&1;
                temp &= self.REG_ACC;
                self.F_ZERO = temp;
                break;

            }case 7:{

                // *******
                // * BMI *
                // *******

                // Branch on negative result
                if(self.F_SIGN == 1){
                    cycleCount++;
                    self.REG_PC = addr;
                }
                break;

            }case 8:{

                // *******
                // * BNE *
                // *******

                // Branch on not zero
                if(self.F_ZERO != 0){
                    cycleCount += ((opaddr&0xFF00)!=(addr&0xFF00)?2:1);
                    self.REG_PC = addr;
                }
                break;

            }case 9:{

                // *******
                // * BPL *
                // *******

                // Branch on positive result
                if(self.F_SIGN == 0){
                    cycleCount += ((opaddr&0xFF00)!=(addr&0xFF00)?2:1);
                    self.REG_PC = addr;
                }
                break;

            }case 10:{

                // *******
                // * BRK *
                // *******

                self.REG_PC+=2;
                self.push((self.REG_PC>>8)&255);
                self.push(self.REG_PC&255);
                self.F_BRK = 1;

                self.push(
                    (self.F_CARRY)|
                    ((self.F_ZERO==0?1:0)<<1)|
                    (self.F_INTERRUPT<<2)|
                    (self.F_DECIMAL<<3)|
                    (self.F_BRK<<4)|
                    (self.F_NOTUSED<<5)|
                    (self.F_OVERFLOW<<6)|
                    (self.F_SIGN<<7)
                );

                self.F_INTERRUPT = 1;
                //self.REG_PC = load(0xFFFE) | (load(0xFFFF) << 8);
                self.REG_PC = self.load16bit(0xFFFE);
                self.REG_PC--;
                break;

            }case 11:{

                // *******
                // * BVC *
                // *******

                // Branch on overflow clear
                if(self.F_OVERFLOW == 0){
                    cycleCount += ((opaddr&0xFF00)!=(addr&0xFF00)?2:1);
                    self.REG_PC = addr;
                }
                break;

            }case 12:{

                // *******
                // * BVS *
                // *******

                // Branch on overflow set
                if(self.F_OVERFLOW == 1){
                    cycleCount += ((opaddr&0xFF00)!=(addr&0xFF00)?2:1);
                    self.REG_PC = addr;
                }
                break;

            }case 13:{

                // *******
                // * CLC *
                // *******

                // Clear carry flag
                self.F_CARRY = 0;
                break;

            }case 14:{

                // *******
                // * CLD *
                // *******

                // Clear decimal flag
                self.F_DECIMAL = 0;
                break;

            }case 15:{

                // *******
                // * CLI *
                // *******

                // Clear interrupt flag
                self.F_INTERRUPT = 0;
                break;

            }case 16:{

                // *******
                // * CLV *
                // *******

                // Clear overflow flag
                self.F_OVERFLOW = 0;
                break;

            }case 17:{

                // *******
                // * CMP *
                // *******

                // Compare memory and accumulator:
                temp = self.REG_ACC - self.load(addr);
                self.F_CARRY = (temp>=0?1:0);
                self.F_SIGN = (temp>>7)&1;
                self.F_ZERO = temp&0xFF;
                cycleCount+=cycleAdd;
                break;

            }case 18:{

                // *******
                // * CPX *
                // *******

                // Compare memory and index X:
                temp = self.REG_X - self.load(addr);
                self.F_CARRY = (temp>=0?1:0);
                self.F_SIGN = (temp>>7)&1;
                self.F_ZERO = temp&0xFF;
                break;

            }case 19:{

                // *******
                // * CPY *
                // *******

                // Compare memory and index Y:
                temp = self.REG_Y - self.load(addr);
                self.F_CARRY = (temp>=0?1:0);
                self.F_SIGN = (temp>>7)&1;
                self.F_ZERO = temp&0xFF;
                break;

            }case 20:{

                // *******
                // * DEC *
                // *******

                // Decrement memory by one:
                temp = (self.load(addr)-1)&0xFF;
                self.F_SIGN = (temp>>7)&1;
                self.F_ZERO = temp;
                self.write(addr, temp);
                break;

            }case 21:{

                // *******
                // * DEX *
                // *******

                // Decrement index X by one:
                self.REG_X = (self.REG_X-1)&0xFF;
                self.F_SIGN = (self.REG_X>>7)&1;
                self.F_ZERO = self.REG_X;
                break;

            }case 22:{

                // *******
                // * DEY *
                // *******

                // Decrement index Y by one:
                self.REG_Y = (self.REG_Y-1)&0xFF;
                self.F_SIGN = (self.REG_Y>>7)&1;
                self.F_ZERO = self.REG_Y;
                break;

            }case 23:{

                // *******
                // * EOR *
                // *******

                // XOR Memory with accumulator, store in accumulator:
                self.REG_ACC = (self.load(addr)^self.REG_ACC)&0xFF;
                self.F_SIGN = (self.REG_ACC>>7)&1;
                self.F_ZERO = self.REG_ACC;
                cycleCount+=cycleAdd;
                break;

            }case 24:{

                // *******
                // * INC *
                // *******

                // Increment memory by one:
                temp = (self.load(addr)+1)&0xFF;
                self.F_SIGN = (temp>>7)&1;
                self.F_ZERO = temp;
                self.write(addr, temp&0xFF);
                break;

            }case 25:{

                // *******
                // * INX *
                // *******

                // Increment index X by one:
                self.REG_X = (self.REG_X+1)&0xFF;
                self.F_SIGN = (self.REG_X>>7)&1;
                self.F_ZERO = self.REG_X;
                break;

            }case 26:{

                // *******
                // * INY *
                // *******

                // Increment index Y by one:
                self.REG_Y++;
                self.REG_Y &= 0xFF;
                self.F_SIGN = (self.REG_Y>>7)&1;
                self.F_ZERO = self.REG_Y;
                break;

            }case 27:{

                // *******
                // * JMP *
                // *******

                // Jump to new location:
                self.REG_PC = addr-1;
                break;

            }case 28:{

                // *******
                // * JSR *
                // *******

                // Jump to new location, saving return address.
                // Push return address on stack:
                self.push((self.REG_PC>>8)&255);
                self.push(self.REG_PC&255);
                self.REG_PC = addr-1;
                break;

            }case 29:{

                // *******
                // * LDA *
                // *******

                // Load accumulator with memory:
                self.REG_ACC = self.load(addr);
                self.F_SIGN = (self.REG_ACC>>7)&1;
                self.F_ZERO = self.REG_ACC;
                cycleCount+=cycleAdd;
                break;

            }case 30:{

                // *******
                // * LDX *
                // *******

                // Load index X with memory:
                self.REG_X = self.load(addr);
                self.F_SIGN = (self.REG_X>>7)&1;
                self.F_ZERO = self.REG_X;
                cycleCount+=cycleAdd;
                break;

            }case 31:{

                // *******
                // * LDY *
                // *******

                // Load index Y with memory:
                self.REG_Y = self.load(addr);
                self.F_SIGN = (self.REG_Y>>7)&1;
                self.F_ZERO = self.REG_Y;
                cycleCount+=cycleAdd;
                break;

            }case 32:{

                // *******
                // * LSR *
                // *******

                // Shift right one bit:
                if(addrMode == 4){ // ADDR_ACC

                    temp = (self.REG_ACC & 0xFF);
                    self.F_CARRY = temp&1;
                    temp >>= 1;
                    self.REG_ACC = temp;

                }else{

                    temp = self.load(addr) & 0xFF;
                    self.F_CARRY = temp&1;
                    temp >>= 1;
                    self.write(addr, temp);

                }
                self.F_SIGN = 0;
                self.F_ZERO = temp;
                break;

            }case 33:{

                // *******
                // * NOP *
                // *******

                // No OPeration.
                // Ignore.
                break;

            }case 34:{

                // *******
                // * ORA *
                // *******

                // OR memory with accumulator, store in accumulator.
                temp = (self.load(addr)|self.REG_ACC)&255;
                self.F_SIGN = (temp>>7)&1;
                self.F_ZERO = temp;
                self.REG_ACC = temp;
                if(addrMode!=11)cycleCount+=cycleAdd; // PostIdxInd = 11
                break;

            }case 35:{

                // *******
                // * PHA *
                // *******

                // Push accumulator on stack
                self.push(self.REG_ACC);
                break;

            }case 36:{

                // *******
                // * PHP *
                // *******

                // Push processor status on stack
                self.F_BRK = 1;
                self.push(
                    (self.F_CARRY)|
                    ((self.F_ZERO==0?1:0)<<1)|
                    (self.F_INTERRUPT<<2)|
                    (self.F_DECIMAL<<3)|
                    (self.F_BRK<<4)|
                    (self.F_NOTUSED<<5)|
                    (self.F_OVERFLOW<<6)|
                    (self.F_SIGN<<7)
                );
                break;

            }case 37:{

                // *******
                // * PLA *
                // *******

                // Pull accumulator from stack
                self.REG_ACC = self.pull();
                self.F_SIGN = (self.REG_ACC>>7)&1;
                self.F_ZERO = self.REG_ACC;
                break;

            }case 38:{

                // *******
                // * PLP *
                // *******

                // Pull processor status from stack
                temp = self.pull();
                self.F_CARRY     = (temp   )&1;
                self.F_ZERO      = (((temp>>1)&1)==1)?0:1;
                self.F_INTERRUPT = (temp>>2)&1;
                self.F_DECIMAL   = (temp>>3)&1;
                self.F_BRK       = (temp>>4)&1;
                self.F_NOTUSED   = (temp>>5)&1;
                self.F_OVERFLOW  = (temp>>6)&1;
                self.F_SIGN      = (temp>>7)&1;

                self.F_NOTUSED = 1;
                break;

            }case 39:{

                // *******
                // * ROL *
                // *******

                // Rotate one bit left
                if(addrMode == 4){ // ADDR_ACC = 4

                    temp = self.REG_ACC;
                    add = self.F_CARRY;
                    self.F_CARRY = (temp>>7)&1;
                    temp = ((temp<<1)&0xFF)+add;
                    self.REG_ACC = temp;

                }else{

                    temp = self.load(addr);
                    add = self.F_CARRY;
                    self.F_CARRY = (temp>>7)&1;
                    temp = ((temp<<1)&0xFF)+add;    
                    self.write(addr, temp);

                }
                self.F_SIGN = (temp>>7)&1;
                self.F_ZERO = temp;
                break;

            }case 40:{

                // *******
                // * ROR *
                // *******

                // Rotate one bit right
                if(addrMode == 4){ // ADDR_ACC = 4

                    add = self.F_CARRY<<7;
                    self.F_CARRY = self.REG_ACC&1;
                    temp = (self.REG_ACC>>1)+add;   
                    self.REG_ACC = temp;

                }else{

                    temp = self.load(addr);
                    add = self.F_CARRY<<7;
                    self.F_CARRY = temp&1;
                    temp = (temp>>1)+add;
                    self.write(addr, temp);

                }
                self.F_SIGN = (temp>>7)&1;
                self.F_ZERO = temp;
                break;

            }case 41:{

                // *******
                // * RTI *
                // *******

                // Return from interrupt. Pull status and PC from stack.

                temp = self.pull();
                self.F_CARRY     = (temp   )&1;
                self.F_ZERO      = ((temp>>1)&1)==0?1:0;
                self.F_INTERRUPT = (temp>>2)&1;
                self.F_DECIMAL   = (temp>>3)&1;
                self.F_BRK       = (temp>>4)&1;
                self.F_NOTUSED   = (temp>>5)&1;
                self.F_OVERFLOW  = (temp>>6)&1;
                self.F_SIGN      = (temp>>7)&1;

                self.REG_PC = self.pull();
                self.REG_PC += (self.pull()<<8);
                if(self.REG_PC==0xFFFF){
                    return;
                }
                self.REG_PC--;
                self.F_NOTUSED = 1;
                break;

            }case 42:{

                // *******
                // * RTS *
                // *******

                // Return from subroutine. Pull PC from stack.

                self.REG_PC = self.pull();
                self.REG_PC += (self.pull()<<8);

                if(self.REG_PC==0xFFFF){
                    return; // return from NSF play routine:
                }
                break;

            }case 43:{

                // *******
                // * SBC *
                // *******

                temp = self.REG_ACC-self.load(addr)-(1-self.F_CARRY);
                self.F_SIGN = (temp>>7)&1;
                self.F_ZERO = temp&0xFF;
                self.F_OVERFLOW = ((((self.REG_ACC^temp)&0x80)!=0 && ((self.REG_ACC^self.load(addr))&0x80)!=0)?1:0);
                self.F_CARRY = (temp<0?0:1);
                self.REG_ACC = (temp&0xFF);
                if(addrMode!=11)cycleCount+=cycleAdd; // PostIdxInd = 11
                break;

            }case 44:{

                // *******
                // * SEC *
                // *******

                // Set carry flag
                self.F_CARRY = 1;
                break;

            }case 45:{

                // *******
                // * SED *
                // *******

                // Set decimal mode
                self.F_DECIMAL = 1;
                break;

            }case 46:{

                // *******
                // * SEI *
                // *******

                // Set interrupt disable status
                self.F_INTERRUPT = 1;
                break;

            }case 47:{

                // *******
                // * STA *
                // *******

                // Store accumulator in memory
                self.write(addr, self.REG_ACC);
                break;

            }case 48:{

                // *******
                // * STX *
                // *******

                // Store index X in memory
                self.write(addr, self.REG_X);
                break;

            }case 49:{

                // *******
                // * STY *
                // *******

                // Store index Y in memory:
                self.write(addr, self.REG_Y);
                break;

            }case 50:{

                // *******
                // * TAX *
                // *******

                // Transfer accumulator to index X:
                self.REG_X = self.REG_ACC;
                self.F_SIGN = (self.REG_ACC>>7)&1;
                self.F_ZERO = self.REG_ACC;
                break;

            }case 51:{

                // *******
                // * TAY *
                // *******

                // Transfer accumulator to index Y:
                self.REG_Y = self.REG_ACC;
                self.F_SIGN = (self.REG_ACC>>7)&1;
                self.F_ZERO = self.REG_ACC;
                break;

            }case 52:{

                // *******
                // * TSX *
                // *******

                // Transfer stack pointer to index X:
                self.REG_X = (self.REG_SP-0x0100);
                self.F_SIGN = (self.REG_SP>>7)&1;
                self.F_ZERO = self.REG_X;
                break;

            }case 53:{

                // *******
                // * TXA *
                // *******

                // Transfer index X to accumulator:
                self.REG_ACC = self.REG_X;
                self.F_SIGN = (self.REG_X>>7)&1;
                self.F_ZERO = self.REG_X;
                break;

            }case 54:{

                // *******
                // * TXS *
                // *******

                // Transfer index X to stack pointer:
                self.REG_SP = (self.REG_X+0x0100);
                self.stackWrap();
                break;

            }case 55:{

                // *******
                // * TYA *
                // *******

                // Transfer index Y to accumulator:
                self.REG_ACC = self.REG_Y;
                self.F_SIGN = (self.REG_Y>>7)&1;
                self.F_ZERO = self.REG_Y;
                break;

            }default:{

                // *******
                // * ??? *
                // *******

                self.nes.stop();
                self.nes.crashMessage = "Game crashed, invalid opcode at address $"+opaddr.toString(16);
                break;

            }

        }// end of switch

        // ----------------------------------------------------------------------------------------------------
        // ----------------------------------------------------------------------------------------------------

        /* This isn't set anywhere
        if(Globals.palEmulation){
            self.palCnt++;
            if(self.palCnt==5){
                self.palCnt=0;
                cycleCount++;
            }
        }*/

        return cycleCount;

    }
    
    this.load = function(addr){
        return addr<0x2000 ? this.nes.cpuMem[addr&0x7FF] : this.mmap.load(addr);
    }
    
    this.load16bit = function(addr){
        return addr<0x1FFF ?
            this.nes.cpuMem[addr&0x7FF] | (this.nes.cpuMem[(addr+1)&0x7FF]<<8)
            :
            this.mmap.load(addr) | (this.mmap.load(addr+1)<<8)
            ;
    }
    
    this.write = function(addr, val){
        if(addr < 0x2000){
            this.nes.cpuMem[addr&0x7FF] = val;
        }else{
            this.mmap.write(addr,val);
        }
    }

    this.requestIrq = function(type){
        if(this.irqRequested){
            if(type == this.IRQ_NORMAL){
                return;
            }
            ////System.out.println("too fast irqs. type="+type);
        }
        this.irqRequested = true;
        this.irqType = type;
    }

    this.push = function(value){
        this.mmap.write(this.REG_SP, value);
        this.REG_SP--;
        this.REG_SP = 0x0100 | (this.REG_SP&0xFF);
    }

    this.stackWrap = function(){
        this.REG_SP = 0x0100 | (this.REG_SP&0xFF);
    }

    this.pull = function(){
        this.REG_SP++;
        this.REG_SP = 0x0100 | (this.REG_SP&0xFF);
        return this.mmap.load(this.REG_SP);
    }

    this.pageCrossed = function(addr1, addr2){
        return ((addr1&0xFF00)!=(addr2&0xFF00));
    }

    this.haltCycles = function(cycles){
        this.cyclesToHalt += cycles;
    }

    this.doNonMaskableInterrupt = function(status){

        if((this.mmap.load(0x2000)&128)!=0){ // Check whether VBlank Interrupts are enabled

            this.REG_PC_NEW++;
            this.push((this.REG_PC_NEW>>8)&0xFF);
            this.push(this.REG_PC_NEW&0xFF);
            //this.F_INTERRUPT_NEW = 1;
            this.push(status);

            this.REG_PC_NEW = this.mmap.load(0xFFFA) | (this.mmap.load(0xFFFB) << 8);
            this.REG_PC_NEW--;

        }


    }

    this.doResetInterrupt = function(){
        this.REG_PC_NEW = this.mmap.load(0xFFFC) | (this.mmap.load(0xFFFD) << 8);
        this.REG_PC_NEW--;
    }

    this.doIrq = function(status){
        this.REG_PC_NEW++;
        this.push((this.REG_PC_NEW>>8)&0xFF);
        this.push(this.REG_PC_NEW&0xFF);
        this.push(status);
        this.F_INTERRUPT_NEW = 1;
        this.F_BRK_NEW = 0;

        this.REG_PC_NEW = this.mmap.load(0xFFFE) | (this.mmap.load(0xFFFF) << 8);
        this.REG_PC_NEW--;
    }

    this.getStatus = function(){
        return (this.F_CARRY)
                |(this.F_ZERO<<1)
                |(this.F_INTERRUPT<<2)
                |(this.F_DECIMAL<<3)
                |(this.F_BRK<<4)
                |(this.F_NOTUSED<<5)
                |(this.F_OVERFLOW<<6)
                |(this.F_SIGN<<7);
    }

    this.setStatus = function(st){
        this.F_CARRY     = (st   )&1;
        this.F_ZERO      = (st>>1)&1;
        this.F_INTERRUPT = (st>>2)&1;
        this.F_DECIMAL   = (st>>3)&1;
        this.F_BRK       = (st>>4)&1;
        this.F_NOTUSED   = (st>>5)&1;
        this.F_OVERFLOW  = (st>>6)&1;
        this.F_SIGN      = (st>>7)&1;
    }

    this.setCrashed = function(value){
        this.crash = value;
    }

    this.setMapper = function(mapper){
        this.mmap = mapper;
    }

    this.destroy = function(){
        this.nes    = null;
        this.mmap   = null;
    }
    
    
}
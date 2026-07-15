import { Controller, Get } from '@nestjs/common';
import { EventPattern, Payload } from '@nestjs/microservices';
import { AppService } from './app.service';
import { BrokerService } from './broker.service';

interface BrokerApprovedEvent {
  brokerId: string;
}

@Controller()
export class AppController {
  constructor(
    private readonly appService: AppService,
    private readonly brokerService: BrokerService,
  ) {}

  @Get()
  getData() {
    return this.appService.getData();
  }

  /**
   * Fired by the admin microservice (over Redis) once an admin has reviewed and
   * approved the broker's documents. Updates the broker record accordingly.
   */
  @EventPattern('broker_approved')
  async handleBrokerApproved(@Payload() data: BrokerApprovedEvent) {
    await this.brokerService.markBrokerVerified(data.brokerId);
  }
}

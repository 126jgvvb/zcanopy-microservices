import { Controller, Logger } from '@nestjs/common';
import { GrpcMethod } from '@nestjs/microservices';
import { PaymentService } from './payment.service';
import type {
  ProcessPaymentDto,
  ProcessPropertyPaymentDto,
  WithdrawDto,
  GetWalletDto,
} from './payment.service';

@Controller()
export class PaymentController {
  private readonly logger = new Logger(PaymentController.name);

  constructor(private readonly paymentService: PaymentService) {}

  @GrpcMethod('PaymentService', 'ProcessSubscriptionPayment')
  async processSubscriptionPayment(dto: ProcessPaymentDto) {
    this.logger.log(`Received payment request for broker ${dto.brokerId}, tier ${dto.tier}`);
    const result = await this.paymentService.processSubscriptionPayment(dto);
    return result;
  }

  @GrpcMethod('PaymentService', 'ProcessPropertyPayment')
  async processPropertyPayment(dto: ProcessPropertyPaymentDto) {
    this.logger.log(`Received property payment request for property ${dto.propertyId}`);
    const result = await this.paymentService.processPropertyPayment(dto);
    return result;
  }

  @GrpcMethod('PaymentService', 'Withdraw')
  async withdraw(dto: WithdrawDto) {
    this.logger.log(`Received withdraw request for wallet ${dto.walletType}, amount ${dto.amount}`);
    const result = await this.paymentService.withdraw(dto);
    return result;
  }

  @GrpcMethod('PaymentService', 'GetWallet')
  async getWallet(dto: GetWalletDto) {
    this.logger.log(`Received getWallet request for ${dto.walletType || 'default'} wallet`);
    const result = await this.paymentService.getWallet(dto);
    return result;
  }

  @GrpcMethod('PaymentService', 'GetTransactions')
  async getTransactions(dto: any) {
    this.logger.log(`Received get-transactions request`);
    return this.paymentService.getTransactions(dto);
  }
}
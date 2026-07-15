import { Controller } from '@nestjs/common';
import { BrokerService } from './broker.service';
import { GrpcMethod } from '@nestjs/microservices';
import { BrokerEntity } from '../entity/broker.entity';

interface GetAllBrokersRequest {
  page: number;
  limit: number;
}

interface GetAllBrokersResponse {
  brokers: BrokerEntity[];
  total: number;
  page: number;
  limit: number;
}

@Controller()
export class AppController {
  constructor(private readonly brokerService: BrokerService) {}

  @GrpcMethod('BrokerService', 'getAllBrokers')
  async getAllBrokers(data: GetAllBrokersRequest):Promise<GetAllBrokersResponse> {
    const res=await this.brokerService.getAllBrokers({page:data.page,limit:data.limit});
    
    return {
        brokers: res.brokers,
        total: res.total,
        page: data.page,
        limit: data.limit,
    };
  }
}




























import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity()
export class BrokerFeedbackEntity {
  @PrimaryGeneratedColumn()
  id!: string;

  @Column({default:''})
  brokerCode!: string;

  @Column({default:''})
  brokerId!: string;

  @Column({default:''})
  email!: string;

  @Column({default:''})
  phone!: string;

  @Column({type:'text',default:''})
  content!: string;

  @Column({ default: 'pending' })
  status!: string;

  @CreateDateColumn()
  createdAt!: Date;
}

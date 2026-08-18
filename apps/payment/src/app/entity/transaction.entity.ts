import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';


@Entity()
export class TransactionEntity{
 @PrimaryGeneratedColumn()
 id!:string;

@Column({default:''})
  propertyID!:string;

  @Column({default:''})
  clientPhone!:string;

  @Column({default:''})
  provider!:string;

  @Column({default:''})
  referenceNumber!:string;

  @Column({default:0})
  amount!:number;

  @Column({default:0})
  platformCommission!:number;

  @Column({default:new Date()})
  createdAt!:Date;

  @Column({default:''})
  paymentStatus!:string

  @Column({default:''})
  reasonForPayment!:string;

  @Column({default:''})
  customerName!:string;

  @Column({default:''})
  customerEmail!:string;

  @Column({default:''})
  transactionCode!:string;
}
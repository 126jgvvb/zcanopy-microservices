import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn } from 'typeorm';


@Entity()
export class PayoutsEntity{
 @PrimaryGeneratedColumn()
 id!:string;

@Column({default:''})
  brokerId!:string;

  @Column({default:''})
  propertyId!:string;

  @Column({default:''})
  customerPhone!:string;

  @Column({default:''})
  customerName!:string;

  @Column({default:0})
  grossAmount!:number;

  @Column({default:0})
  platformCommission!:number;

  @Column({default:0})
  bookingCommission!:number;

  @Column({default:0})
  netAmount!:number;

  @Column({default:''})
  transactionID!:string;

  @Column({default:''})
  transactionCode!:string;

  @Column({default:'PENDING'})
  payoutStatus!:string;

  @Column({default:''})
  provider!:string;

  @Column({default:''})
  recipient_phone!:string;

 @CreateDateColumn()
 createdAt!:Date;

 @UpdateDateColumn()
 updatedAt!:Date;

}
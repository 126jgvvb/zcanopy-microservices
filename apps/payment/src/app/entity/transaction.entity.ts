import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';


@Entity()
export class TransactionEntity{
 @PrimaryGeneratedColumn()
 id!:string;

 @Column()
 propertyID!:string;

 @Column()
 clientPhone!:string;

 @Column()
 provider!:string;

 @Column()
 referenceNumber!:string;

 @Column()
 amount!:number;

 @Column()
 platformCommission!:number; 

 @Column()
 createdAt!:Date;

 @Column()
 paymentStatus!:string

 @Column()
 reasonForPayment!:string;

 @Column()
 customerName!:string;

 @Column()
 customerEmail!:string;

 @Column()
 transactionCode!:string;
}
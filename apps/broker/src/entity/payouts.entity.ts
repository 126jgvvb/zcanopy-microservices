import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn } from 'typeorm';


@Entity()
export class PayoutsEntity{
 @PrimaryGeneratedColumn()
 id!:string;

 @Column()
 brokerId!:string;

 @Column()
 propertyId!:string;

 @Column()
 customerPhone!:string;

 @Column()
 customerName!:string;

 @Column()
 grossAmount!:number;

 @Column()
 platformCommission!:number;

 @Column()
 bookingCommission!:number;

 @Column()
 netAmount!:number;

 @Column()
 transactionID!:string;

 @Column()
 transactionCode!:string;

 @Column()
 payoutStatus!:string;

 @Column()
 provider!:string;

 @Column()
 recipient_phone!:string;

 @CreateDateColumn()
 createdAt!:Date;

 @UpdateDateColumn()
 updatedAt!:Date;

}
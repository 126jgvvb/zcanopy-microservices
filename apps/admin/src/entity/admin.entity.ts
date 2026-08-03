import {Entity, Column,PrimaryGeneratedColumn} from 'typeorm';

@Entity()
export class AdminEntity{
 @PrimaryGeneratedColumn()
 id!:string;

 @Column()
 username!:string;

 @Column()
 email!: string;

 @Column()
 passwordHash!:string;

 @Column()
 role!:string;

 @Column()
 isActive!:boolean;

 @Column()
 lastLoggedIn!:Date;

 @Column()
 createdAt!:Date

 @Column()
 phoneNumber!:string;

@Column({ type: 'simple-array' })
  otherAdmins!: string[]

 @Column()
 status!:string;

 @Column()
 isDeleted!:boolean;

 @Column()
 handledMessages!:number;

 @Column()
 sentEmails!:number;

 @Column()
 sentSms!:number;

}
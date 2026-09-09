import {Entity, Column,PrimaryGeneratedColumn} from 'typeorm';

@Entity()
export class AdminEntity{
@PrimaryGeneratedColumn()
  id!:string;

@Column({default:''})
  username!:string;

  @Column({default:''})
  email!: string;

  @Column({default:''})
  passwordHash!:string;

  @Column({default:'admin'})
  role!:string;

  @Column({default:true})
  isActive!:boolean;

  @Column({default:new Date()})
  lastLoggedIn!:Date;

  @Column({default:new Date()})
  createdAt!:Date

  @Column({default:''})
  phoneNumber!:string;

  @Column({type:'simple-array',default:[]})
  otherAdmins!: string[]

  @Column({default:'active'})
  status!:string;

  @Column({default:false})
  isDeleted!:boolean;

  @Column({default:0})
  handledMessages!:number;

  @Column({default:0})
  sentEmails!:number;

  @Column({default:0})
  sentSms!:number;

}
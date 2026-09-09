import {Entity,Column,PrimaryGeneratedColumn,Index} from 'typeorm';

@Entity()
@Index(['propertyId','createdAt'])
export class CustomerCommentEntity{
  @PrimaryGeneratedColumn()
  id!:string;

  @Column({default:''})
  sessionId!:string;

  @Column({default:''})
  sessionToken!:string;

  @Column({default:''})
  propertyId!:string;

  @Column({default:''})
  customerName!:string;

  @Column({default:''})
  customerPhone!:string;

  @Column({default:''})
  customerEmail!:string;

  @Column()
  comment!:string;

  @Column({default:0})
  rating!:number;

  @Column({default: new Date()})
  createdAt!:Date;
}

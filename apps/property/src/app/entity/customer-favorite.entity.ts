import {Entity,Column,PrimaryGeneratedColumn,Index} from 'typeorm';

@Entity()
@Index(['sessionId','propertyId'],{unique:true})
export class CustomerFavoriteEntity{
  @PrimaryGeneratedColumn()
  id!:string;

  @Column({default:''})
  sessionId!:string;

  @Column({default:''})
  sessionToken!:string;

  @Column({default:''})
  propertyId!:string;

  @Column({default:''})
  propertyTitle!:string;

  @Column({default:''})
  propertyLocation!:string;

  @Column({default:''})
  brokerCode!:string;

  @Column({default:''})
  imageUrl!:string;

  @Column({default:0})
  price!:number;

  @Column({default: new Date()})
  createdAt!:Date;
}

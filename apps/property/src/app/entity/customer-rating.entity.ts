import {Entity,Column,PrimaryGeneratedColumn,Index} from 'typeorm';

@Entity()
@Index(['propertyId'],{unique:true})
export class CustomerRatingEntity{
  @PrimaryGeneratedColumn()
  id!:string;

  @Column({default:''})
  propertyId!:string;

  @Column({default:0})
  averageRating!:number;

  @Column({default:0})
  reviewCount!:number;

  @Column({default: new Date()})
  updatedAt!:Date;
}

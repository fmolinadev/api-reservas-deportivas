import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayNotEmpty,
  ArrayUnique,
  IsArray,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';
import { PaginacionDto } from '../../../common/response/pagination.js';

const ID_ESPACIO = /^esp-[A-Za-z0-9_-]{1,36}$/;
const recortar = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

export class CrearInspeccionDto {
  @ApiProperty({ example: 'esp-02' })
  @Matches(ID_ESPACIO, {
    message: 'El espacio tiene que ser un id de espacio.',
  })
  espacioId: string;

  @ApiProperty({ example: 'La red tiene un corte en el lateral.' })
  @Transform(recortar)
  @MaxLength(1000, { message: 'La observación es demasiado larga.' })
  @IsNotEmpty({ message: 'Escribí una observación.' })
  @IsString({ message: 'Escribí una observación.' })
  observacion: string;

  @ApiProperty({
    type: [String],
    description: 'Entre una y cinco URLs de evidencias subidas a esta API.',
    example: [
      'http://192.168.0.10:3000/archivos/imagenes/2026/09/abc12345.jpg',
    ],
  })
  @ArrayUnique({ message: 'No repitas la misma evidencia.' })
  @ArrayMaxSize(5, { message: 'Podés adjuntar hasta cinco evidencias.' })
  @ArrayNotEmpty({ message: 'Adjuntá al menos una foto o un video.' })
  @IsArray({ message: 'Adjuntá al menos una foto o un video.' })
  @IsString({
    each: true,
    message: 'Cada evidencia tiene que ser una dirección de archivo.',
  })
  @MaxLength(2048, {
    each: true,
    message: 'La dirección de una evidencia es demasiado larga.',
  })
  evidencias: string[];
}

export class FiltrosInspeccionesDto extends PaginacionDto {
  @ApiPropertyOptional({ example: 'esp-02' })
  @IsOptional()
  @Matches(ID_ESPACIO, { message: 'El espacio no es válido.' })
  espacioId?: string;
}

import { type TestRecording } from '@cmx-replayer/shared';
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { TestRecordingMongo } from './schemas';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';

@Injectable()
export class RecordingsService {
  private readonly log = new Logger(RecordingsService.name);

  constructor(@InjectModel(TestRecordingMongo.name) private recordings: Model<TestRecording>) {}

  async getRecordings(): Promise<TestRecording[]> {
    this.log.debug('Getting all recordings');
    return this.recordings.find().exec();
  }

  async getRecording(id: string): Promise<TestRecording> {
    this.log.debug(`Getting recording by ID: ${id}`);
    const recording = await this.recordings.findById(id).exec();
    if (!recording) {
      throw new NotFoundException(`Recording '${id}' not found`);
    }
    return recording;
  }

  async createRecording(data: Omit<TestRecording, 'id' | 'created' | 'updated'>): Promise<TestRecording> {
    this.log.debug(`Creating recording: ${JSON.stringify(data)}`);
    const created = new this.recordings(data);
    return created.save();
  }

  async deleteRecording(id: string): Promise<void> {
    this.log.debug(`Deleting recording ${id}`);
    const result = await this.recordings.findByIdAndDelete(id).exec();
    if (!result) {
      throw new NotFoundException(`Recording '${id}' not found`);
    }
  }

  async updateRecording(id: string, data: Partial<TestRecording>): Promise<TestRecording> {
    this.log.debug(`Updating recording ${id}: ${JSON.stringify(data)}`);
    const updated = await this.recordings.findByIdAndUpdate(id, data, { new: true }).exec();
    if (!updated) {
      throw new NotFoundException(`Recording '${id}' not found`);
    }
    return updated;
  }

  async getCategories(): Promise<string[]> {
    this.log.debug('Getting all categories');
    return this.recordings.distinct('category').exec();
  }
}

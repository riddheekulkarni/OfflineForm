import { describe, it, expect, beforeEach, vi } from 'vitest';

import { shareCSVFiles } from '../services/shareService';

describe('CSV sharing tests', () => {
  const sampleFile = {
    fileName: 'T1_test.csv',
    content: 'Name,Phone,City\nRiddhee,9876543210,Pune',
    recordCount: 1,
  };

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('should reject when there are no files', async () => {
    await expect(
      shareCSVFiles([])
    ).rejects.toThrow('There are no CSV files to share.');
  });

  it('should reject when more than five files are provided', async () => {
    const files = Array.from({ length: 6 }, (_, index) => ({
      ...sampleFile,
      fileName: `T1_test_${index}.csv`,
    }));

    await expect(
      shareCSVFiles(files)
    ).rejects.toThrow('A maximum of five CSV files can be shared at once.');
  });

  it('should reject when browser sharing is unavailable', async () => {
    vi.stubGlobal('navigator', {});

    await expect(
      shareCSVFiles([sampleFile])
    ).rejects.toThrow('Sharing is unavailable in this browser.');
  });

  it('should reject when the browser cannot share CSV attachments', async () => {
    vi.stubGlobal('navigator', {
      share: vi.fn(),
      canShare: vi.fn().mockReturnValue(false),
    });

    await expect(
      shareCSVFiles([sampleFile])
    ).rejects.toThrow('This browser cannot share these CSV attachments.');
  });

  it('should share CSV files successfully', async () => {
    const shareMock = vi.fn().mockResolvedValue(undefined);

    vi.stubGlobal('navigator', {
      share: shareMock,
      canShare: vi.fn().mockReturnValue(true),
    });

    await expect(
      shareCSVFiles([sampleFile])
    ).resolves.toBeUndefined();

    expect(shareMock).toHaveBeenCalledTimes(1);

    const sharedData = shareMock.mock.calls[0][0];

    expect(sharedData.files.length).toBe(1);
    expect(sharedData.files[0].name).toBe('T1_test.csv');
    expect(sharedData.files[0].type).toBe('text/csv;charset=utf-8');
  });

  it('should propagate sharing cancellation or errors', async () => {
    const shareMock = vi.fn().mockRejectedValue(
      new Error('Sharing cancelled')
    );

    vi.stubGlobal('navigator', {
      share: shareMock,
      canShare: vi.fn().mockReturnValue(true),
    });

    await expect(
      shareCSVFiles([sampleFile])
    ).rejects.toThrow('Sharing cancelled');
  });
});
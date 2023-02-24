// @flow
import { Trans } from '@lingui/macro';
import * as React from 'react';
import {
  allResourceKindsAndMetadata,
  type ChooseResourceOptions,
  type ResourceKind,
} from './ResourceSource';
import AuthenticatedUserContext from '../Profile/AuthenticatedUserContext';
import AlertMessage from '../UI/AlertMessage';
import { ColumnStackLayout, LineStackLayout } from '../UI/Layout';
import {
  type UploadedProjectResourceFiles,
  uploadProjectResourceFiles,
  PROJECT_RESOURCE_MAX_SIZE_IN_BYTES,
} from '../Utils/GDevelopServices/Project';
import { type StorageProvider, type FileMetadata } from '../ProjectsStorage';
import { Line, Column } from '../UI/Grid';
import LinearProgress from '../UI/LinearProgress';
import Paper from '../UI/Paper';
import GDevelopThemeContext from '../UI/Theme/GDevelopThemeContext';
import RaisedButton from '../UI/RaisedButton';

type FileToCloudProjectResourceUploaderProps = {
  options: ChooseResourceOptions,
  fileMetadata: ?FileMetadata,
  getStorageProvider: () => StorageProvider,
  onChooseResources: (resources: Array<gdResource>) => void,
  createNewResource: () => gdResource,
  automaticallyOpenInput: boolean,
};

const resourceKindToInputAcceptedMimes = {
  audio: ['audio/aac', 'audio/x-wav', 'audio/mpeg', 'audio/mp3', 'audio/ogg'],
  image: ['image/jpeg', 'image/png', 'image/webp'],
  font: ['font/ttf', 'font/otf'],
  video: ['video/mp4', 'video/webm'],
  json: ['application/json'],
  tilemap: ['application/json'],
  tileset: ['application/json'],
  bitmapFont: [],
};

export const getInputAcceptedMimesAndExtensions = (
  resourceKind: ResourceKind
) => {
  const resourceKindMetadata =
    allResourceKindsAndMetadata.find(({ kind }) => kind === resourceKind) ||
    null;
  const acceptedExtensions = resourceKindMetadata
    ? resourceKindMetadata.fileExtensions.map(extension => '.' + extension)
    : [];
  const acceptedMimes = resourceKindToInputAcceptedMimes[resourceKind] || [];

  return [...acceptedMimes, ...acceptedExtensions].join(',');
};

export const FileToCloudProjectResourceUploader = ({
  options,
  fileMetadata,
  getStorageProvider,
  onChooseResources,
  createNewResource,
  automaticallyOpenInput,
}: FileToCloudProjectResourceUploaderProps) => {
  const inputRef = React.useRef<?HTMLInputElement>(null);
  const hasAutomaticallyOpenedInput = React.useRef(false);
  const gdevelopTheme = React.useContext(GDevelopThemeContext);
  const authenticatedUser = React.useContext(AuthenticatedUserContext);
  const [error, setError] = React.useState<?Error>(null);
  const [isUploading, setIsUploading] = React.useState(false);
  const [selectedFiles, setSelectedFiles] = React.useState<File[]>([]);
  const hasSelectedFiles = selectedFiles.length > 0;
  const storageProvider = React.useMemo(getStorageProvider, [
    getStorageProvider,
  ]);
  const cloudProjectId = fileMetadata ? fileMetadata.fileIdentifier : null;
  const [uploadProgress, setUploadProgress] = React.useState(0);
  const onUpload = React.useCallback(
    async () => {
      const input = inputRef.current;
      if (!input) return;
      if (!cloudProjectId) return;

      try {
        setIsUploading(true);
        setError(null);
        setUploadProgress(0);
        const results: UploadedProjectResourceFiles = await uploadProjectResourceFiles(
          authenticatedUser,
          cloudProjectId,
          selectedFiles,
          (current: number, total: number) => {
            setUploadProgress((current / total) * 100);
          }
        );
        const erroredResults = results.filter(({ error }) => !!error);
        const okResults = results.filter(({ url }) => !!url);
        if (erroredResults.length) {
          throw erroredResults[0];
        } else if (okResults.length) {
          onChooseResources(
            okResults.map(({ url, resourceFile }) => {
              const newResource = createNewResource();
              newResource.setFile(url || '');
              newResource.setName(resourceFile.name);
              newResource.setOrigin('cloud-project-resource', url || '');

              return newResource;
            })
          );
        }
      } catch (error) {
        setError(error);
      } finally {
        setIsUploading(false);
      }
    },
    [
      selectedFiles,
      authenticatedUser,
      onChooseResources,
      createNewResource,
      cloudProjectId,
    ]
  );

  const invalidFiles = selectedFiles
    .map(file => {
      if (file.size > PROJECT_RESOURCE_MAX_SIZE_IN_BYTES) {
        return {
          filename: file.name,
          error: 'too-large',
        };
      }
      return null;
    })
    .filter(Boolean);

  const canUploadWithThisStorageProvider =
    storageProvider.internalName === 'Cloud' && !!fileMetadata;
  const isConnected = !!authenticatedUser.authenticated;
  const canChooseFiles =
    !isUploading && isConnected && canUploadWithThisStorageProvider;

  // Automatically open the input once, at the first render, if asked.
  React.useLayoutEffect(
    () => {
      if (automaticallyOpenInput && !hasAutomaticallyOpenedInput.current) {
        hasAutomaticallyOpenedInput.current = true;
        if (inputRef.current) inputRef.current.click();
      }
    },
    [automaticallyOpenInput]
  );

  // Start uploading after choosing some files (if there are no errors and
  // if no error happened during the last upload attempt).
  const canUploadFiles =
    !isUploading &&
    canChooseFiles &&
    hasSelectedFiles &&
    invalidFiles.length === 0;
  React.useEffect(
    () => {
      if (canUploadFiles && !error) {
        onUpload();
      }
    },
    [canUploadFiles, onUpload, error]
  );

  return (
    <ColumnStackLayout noMargin>
      {!isConnected ? (
        <AlertMessage kind="warning">
          <Trans>
            Your need to first create your account, or login, to upload your own
            resources.
          </Trans>
        </AlertMessage>
      ) : !canUploadWithThisStorageProvider ? (
        <AlertMessage kind="warning">
          <Trans>
            Your need to first save your game on GDevelop Cloud to upload your
            own resources.
          </Trans>
        </AlertMessage>
      ) : null}
      <Paper variant="outlined" background="medium">
        <Line expand>
          <Column expand>
            <input
              accept={getInputAcceptedMimesAndExtensions(options.resourceKind)}
              style={{
                color: gdevelopTheme.text.color.primary,
              }}
              multiple={options.multiSelection}
              type="file"
              ref={inputRef}
              disabled={!canChooseFiles}
              onChange={event => {
                const files = [];
                for (let i = 0; i < event.currentTarget.files.length; i++) {
                  files.push(event.currentTarget.files[i]);
                }
                setSelectedFiles(files);

                // Remove the previous error, if any, to let a new upload attempt be triggered.
                setError(null);
              }}
            />
          </Column>
        </Line>
      </Paper>
      {invalidFiles.map(erroredFile => {
        if (erroredFile.error === 'too-large')
          return (
            <AlertMessage kind="error">
              <Trans>
                The file {erroredFile.filename} is too large. Use files that are
                smaller for your game: each must be less than{' '}
                {PROJECT_RESOURCE_MAX_SIZE_IN_BYTES / 1000 / 1000} MB.
              </Trans>
            </AlertMessage>
          );

        return (
          <AlertMessage kind="error">
            <Trans>The file {erroredFile.filename} is invalid.</Trans>
          </AlertMessage>
        );
      })}
      {error && (
        <AlertMessage kind="error">
          <Trans>
            There was an error while uploading some resources. Verify your
            internet connection or try again later.
          </Trans>
        </AlertMessage>
      )}
      <LineStackLayout alignItems="center" justifyContent="stretch" expand>
        {isUploading ? (
          <LinearProgress expand value={uploadProgress} variant="determinate" />
        ) : null}
      </LineStackLayout>
      {error && (
        <Line noMargin expand justifyContent="flex-end">
          <RaisedButton
            primary
            label={<Trans>Retry</Trans>}
            onClick={onUpload}
          />
        </Line>
      )}
    </ColumnStackLayout>
  );
};
